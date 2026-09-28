package services

import (
	"errors"
	"fmt"
	"math"
	"strings"

	"backend/internal/config"
	"backend/internal/models"
)

// BatchSendItem is one recipient and the message written for them.
type BatchSendItem struct {
	Phone   string `json:"phone"`
	Message string `json:"message"`
}

// BatchSendRequest sends personalised messages, e.g. a mail-merge from a spreadsheet.
type BatchSendRequest struct {
	Channel   string          `json:"channel"`    // sms or whatsapp
	AccountID uint            `json:"account_id"` // WhatsApp number to send from
	Items     []BatchSendItem `json:"items"`
	models.WhatsAppRich
}

// BatchSendResponse summarises a batch.
type BatchSendResponse struct {
	Accepted int      `json:"accepted"` // queued or sent
	Failed   int      `json:"failed"`
	Errors   []string `json:"errors"`
}

// ErrBatchPaymentRequired means the balance can't cover the whole batch; nothing was sent.
var ErrBatchPaymentRequired = errors.New("insufficient balance for this batch")

const batchSendMaxItems = 1000

// BatchSendService sends a different message to each recipient. Messages with identical text are
// grouped into one send, and every send goes through the normal SMS / WhatsApp paths so billing,
// free allowances and WhatsApp rate limits apply exactly as for a manual send.
type BatchSendService struct {
	sms      *DeveloperKeyService
	whatsapp *WhatsAppService
	billing  *BillingService
	cfg      *config.Config
}

// NewBatchSendService creates a BatchSendService.
func NewBatchSendService(sms *DeveloperKeyService, whatsapp *WhatsAppService, billing *BillingService, cfg *config.Config) *BatchSendService {
	return &BatchSendService{sms: sms, whatsapp: whatsapp, billing: billing, cfg: cfg}
}

// Send checks the balance for the whole batch up front, then sends it.
func (s *BatchSendService) Send(userID uint, req *BatchSendRequest) (*BatchSendResponse, error) {
	channel := normalizeTemplateChannel(req.Channel)
	if len(req.Items) == 0 {
		return nil, errors.New("at least one message is required")
	}
	if len(req.Items) > batchSendMaxItems {
		return nil, fmt.Errorf("a maximum of %d messages is allowed per batch", batchSendMaxItems)
	}

	// Group recipients by message text, dropping exact duplicates.
	var order []string
	groups := map[string][]string{}
	seen := map[string]bool{}
	for _, item := range req.Items {
		phone, message := strings.TrimSpace(item.Phone), strings.TrimSpace(item.Message)
		if phone == "" || message == "" || seen[phone+"\x00"+message] {
			continue
		}
		seen[phone+"\x00"+message] = true
		if _, ok := groups[message]; !ok {
			order = append(order, message)
		}
		groups[message] = append(groups[message], phone)
	}
	if len(order) == 0 {
		return nil, errors.New("every message needs a phone number and some text")
	}

	if err := s.checkBalance(userID, channel, req.AccountID, order, groups); err != nil {
		return nil, err
	}

	chunkSize := 500
	if channel == "whatsapp" && s.cfg.WhatsAppMaxRecipients > 0 {
		chunkSize = s.cfg.WhatsAppMaxRecipients
	}
	res := &BatchSendResponse{Errors: []string{}}
	addError := func(msg string) {
		if len(res.Errors) < 10 {
			res.Errors = append(res.Errors, msg)
		}
	}
	for _, message := range order {
		phones := groups[message]
		for start := 0; start < len(phones); start += chunkSize {
			chunk := phones[start:min(start+chunkSize, len(phones))]
			if channel == "whatsapp" {
				out, err := s.whatsapp.Send(userID, &models.SendWhatsAppRequest{AccountID: req.AccountID, Phones: chunk, Message: message, WhatsAppRich: req.WhatsAppRich})
				if err != nil {
					res.Failed += len(chunk)
					addError(err.Error())
					continue
				}
				res.Accepted += out.Queued + out.Sent
				res.Failed += out.Failed
				for _, m := range out.Messages {
					if m.Error != "" {
						addError(m.Recipient + ": " + m.Error)
					}
				}
				continue
			}
			if _, err := s.sms.EnqueueGatewaySMS(&models.User{ID: userID}, &models.GatewaySendSMSRequest{Phones: chunk, Message: message}); err != nil {
				res.Failed += len(chunk)
				addError(err.Error())
				continue
			}
			res.Accepted += len(chunk)
		}
	}
	return res, nil
}

// checkBalance refuses a batch the user can't pay for, so it isn't half sent.
func (s *BatchSendService) checkBalance(userID uint, channel string, accountID uint, order []string, groups map[string][]string) error {
	if s.billing == nil {
		return nil
	}
	sum, err := s.billing.Summary(userID)
	if err != nil {
		return nil // billing is still enforced per send
	}
	if channel == "whatsapp" {
		if accounts, err := s.whatsapp.ListAccounts(userID); err == nil {
			for _, a := range accounts {
				if a.ID == accountID && a.Provider == models.WhatsAppProviderSandbox {
					return nil // sandbox sends are not charged
				}
			}
		}
		needed := 0
		for _, m := range order {
			needed += len(groups[m])
		}
		if short := needed - sum.WhatsAppBalance - sum.FreeWhatsAppRemaining; short > 0 {
			return fmt.Errorf("%w: needs %d WhatsApp credits, you have %d (+%d free today); buy %d more (about UGX %d)",
				ErrBatchPaymentRequired, needed, sum.WhatsAppBalance, sum.FreeWhatsAppRemaining, short, short*sum.WhatsAppPriceUGX)
		}
		return nil
	}
	needed := 0
	for _, m := range order {
		segments := int(math.Ceil(float64(len(m)) / 160.0)) // same rule as the SMS queue
		needed += segments * len(groups[m])
	}
	if short := needed - sum.SMSBalance - sum.FreeSMSRemaining; short > 0 {
		return fmt.Errorf("%w: needs %d SMS credits, you have %d (+%d free today); top up %d credits (about UGX %d)",
			ErrBatchPaymentRequired, needed, sum.SMSBalance, sum.FreeSMSRemaining, short, short*sum.SMSPriceUGX)
	}
	return nil
}
