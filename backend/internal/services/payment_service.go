package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"backend/internal/config"
	"backend/internal/models"
	"backend/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type PaymentService struct {
	db               *gorm.DB
	repo             *repository.PaymentRepository
	notifService     *NotificationService
	smsConfigService *SMSConfigService
	redisService     *RedisService
	cfg              *config.Config
	httpClient       *http.Client
	billing          *BillingService
	onTopup          func(payment models.PaymentTransaction, user models.User)
}

// SetTopupHook registers a callback run after a user payment completes (used for admin alerts).
func (s *PaymentService) SetTopupHook(hook func(payment models.PaymentTransaction, user models.User)) {
	s.onTopup = hook
}

// SetBilling enables plan-aware SMS pricing, plan purchases and WhatsApp credit purchases.
func (s *PaymentService) SetBilling(billing *BillingService) {
	s.billing = billing
}

func NewPaymentService(
	db *gorm.DB,
	repo *repository.PaymentRepository,
	notifService *NotificationService,
	smsConfigService *SMSConfigService,
	redisService *RedisService,
	cfg *config.Config,
) *PaymentService {
	return &PaymentService{
		db:               db,
		repo:             repo,
		notifService:     notifService,
		smsConfigService: smsConfigService,
		redisService:     redisService,
		cfg:              cfg,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func validateCollectionMethod(method, phone string) (string, error) {
	if method == "" {
		method = "mobile_money"
	}
	if method != "mobile_money" && method != "card" {
		return "", errors.New("method must be mobile_money or card")
	}
	if method == "mobile_money" && phone == "" {
		return "", errors.New("phone_number is required for mobile money collections")
	}
	return method, nil
}

// CreateCollection starts an SMS credit purchase. The price per SMS follows the user's plan.
func (s *PaymentService) CreateCollection(userID uint, req *models.CreateCollectionRequest) (*models.CreateCollectionResponse, error) {
	if req.AmountUGX < 500 || req.AmountUGX > 10000000 {
		return nil, errors.New("amount_ugx must be between 500 and 10000000")
	}

	pricePerSMS, whatsAppPerSMS := 0, 0
	var err error
	if s.billing != nil {
		pricePerSMS, whatsAppPerSMS, err = s.billing.SMSPriceForUser(userID, req.AmountUGX)
	} else {
		pricePerSMS, err = s.smsConfigService.PriceForAmountUGX(req.AmountUGX)
	}
	if err != nil {
		return nil, err
	}
	smsCredits := req.AmountUGX / pricePerSMS

	return s.startCollection(&models.PaymentTransaction{
		UserID:          &userID,
		Purpose:         models.PaymentPurposeSMS,
		AmountUGX:       req.AmountUGX,
		SMSCredits:      smsCredits,
		WhatsAppCredits: smsCredits * whatsAppPerSMS,
		PricePerSMS:     pricePerSMS,
		PhoneNumber:     req.PhoneNumber,
		Method:          req.Method,
		Description:     req.Description,
	})
}

// CreatePlanCollection starts paying for a plan. The plan is activated when the payment completes.
func (s *PaymentService) CreatePlanCollection(userID uint, plan *models.BillingPlan, req *models.SubscribeRequest) (*models.CreateCollectionResponse, error) {
	if plan.PriceUGX < 500 {
		return nil, errors.New("this plan has no price to pay")
	}
	planID := plan.ID
	return s.startCollection(&models.PaymentTransaction{
		UserID:          &userID,
		Purpose:         models.PaymentPurposePlan,
		PlanID:          &planID,
		AmountUGX:       plan.PriceUGX,
		WhatsAppCredits: plan.WhatsAppCredits,
		PhoneNumber:     req.PhoneNumber,
		Method:          req.Method,
		Description:     fmt.Sprintf("%s plan (%d days)", plan.Name, plan.DurationDays),
	})
}

// CreateWhatsAppCollection starts a WhatsApp credit purchase at the user's plan price.
func (s *PaymentService) CreateWhatsAppCollection(userID uint, req *models.BuyWhatsAppCreditsRequest) (*models.CreateCollectionResponse, error) {
	if s.billing == nil {
		return nil, errors.New("billing is not configured")
	}
	if req.Credits <= 0 {
		return nil, errors.New("credits must be greater than zero")
	}
	price, err := s.billing.WhatsAppCreditPrice(userID)
	if err != nil {
		return nil, err
	}
	amount := req.Credits * price
	if amount < 500 || amount > 10000000 {
		return nil, fmt.Errorf("order total must be between 500 and 10000000 UGX (at %d UGX per WhatsApp credit)", price)
	}
	return s.startCollection(&models.PaymentTransaction{
		UserID:          &userID,
		Purpose:         models.PaymentPurposeWhatsApp,
		AmountUGX:       amount,
		WhatsAppCredits: req.Credits,
		PhoneNumber:     req.PhoneNumber,
		Method:          req.Method,
		Description:     fmt.Sprintf("Buy %d WhatsApp credits", req.Credits),
	})
}

// startCollection records a pending collection and asks MarzPay to charge the customer.
func (s *PaymentService) startCollection(payment *models.PaymentTransaction) (*models.CreateCollectionResponse, error) {
	method, err := validateCollectionMethod(payment.Method, payment.PhoneNumber)
	if err != nil {
		return nil, err
	}
	if s.cfg.MarzPayBasicAuth == "" {
		return nil, errors.New("MARZPAY_BASIC_AUTH is not configured")
	}

	payment.Method = method
	payment.Type = models.PaymentTypeCollection
	payment.Status = models.PaymentStatusPending
	payment.Country = "UG"
	payment.Reference = uuid.NewString()
	if err := s.repo.Create(payment); err != nil {
		return nil, fmt.Errorf("failed to create payment record: %w", err)
	}

	rawResp, err := s.sendMarzCollection(payment)
	if err != nil {
		payment.Status = models.PaymentStatusFailed
		payment.RawPayload = err.Error()
		_ = s.db.Save(payment).Error
		s.cachePayment(payment)
		return nil, err
	}

	payment.Status = models.PaymentStatusProcessing
	payment.RawPayload = marshalRaw(rawResp)
	redirectURL := ""
	if txData, ok := rawResp["data"].(map[string]interface{}); ok {
		if val, ok := txData["redirect_url"].(string); ok {
			redirectURL = val
		}
		if transaction, ok := txData["transaction"].(map[string]interface{}); ok {
			if val, ok := transaction["uuid"].(string); ok {
				payment.TransactionUUID = val
			}
			if val, ok := transaction["status"].(string); ok && val != "" {
				payment.Status = val
			}
		}
	}
	if payment.Method == "card" && redirectURL == "" {
		payment.Status = models.PaymentStatusFailed
		_ = s.db.Save(payment).Error
		s.cachePayment(payment)
		return nil, errors.New("MarzPay did not return a card payment page")
	}
	if err := s.db.Save(payment).Error; err != nil {
		return nil, fmt.Errorf("failed to update payment record: %w", err)
	}
	s.cachePayment(payment)

	return &models.CreateCollectionResponse{
		Reference:       payment.Reference,
		Status:          payment.Status,
		Purpose:         payment.Purpose,
		AmountUGX:       payment.AmountUGX,
		SMSCredits:      payment.SMSCredits,
		WhatsAppCredits: payment.WhatsAppCredits,
		PricePerSMS:     payment.PricePerSMS,
		RedirectURL:     redirectURL,
		RawResponse:     rawResp,
	}, nil
}

func (s *PaymentService) sendMarzCollection(payment *models.PaymentTransaction) (map[string]interface{}, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if payment.PhoneNumber != "" {
		_ = writer.WriteField("phone_number", payment.PhoneNumber)
	}
	_ = writer.WriteField("amount", fmt.Sprintf("%d", payment.AmountUGX))
	_ = writer.WriteField("country", payment.Country)
	_ = writer.WriteField("reference", payment.Reference)
	_ = writer.WriteField("method", payment.Method)
	if payment.Description != "" {
		_ = writer.WriteField("description", payment.Description)
	}
	if callbackURL := s.marzCallbackURLFor(payment); callbackURL != "" {
		_ = writer.WriteField("callback_url", callbackURL)
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}

	endpoint := strings.TrimRight(s.cfg.MarzPayBaseURL, "/") + "/collect-money"
	httpReq, err := http.NewRequest(http.MethodPost, endpoint, &body)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())
	httpReq.Header.Set("Authorization", s.marzAuthorizationHeader())

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("MarzPay collection request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read MarzPay response: %w", err)
	}

	var rawResp map[string]interface{}
	_ = json.Unmarshal(respBody, &rawResp)
	if resp.StatusCode >= 400 {
		return rawResp, fmt.Errorf("MarzPay returned status %d: %s", resp.StatusCode, string(respBody))
	}
	return rawResp, nil
}

func (s *PaymentService) HandleMarzPayWebhook(payload *models.MarzPayWebhookPayload, rawBody []byte) error {
	reference := payload.Transaction.Reference
	if reference == "" {
		return errors.New("missing transaction.reference")
	}

	var userID uint
	var completed bool
	var notifyTitle, notifyMessage string
	var paidPayment models.PaymentTransaction
	var paidUser models.User

	err := s.db.Transaction(func(tx *gorm.DB) error {
		payment, err := s.repo.FindByReferenceForUpdate(tx, reference)
		if err != nil {
			return err
		}

		payment.TransactionUUID = payload.Transaction.UUID
		payment.Provider = payload.Collection.Provider
		if payment.Provider == "" {
			payment.Provider = payload.Transaction.Provider
		}
		payment.ProviderTransactionID = payload.Collection.ProviderTransactionID
		if payload.Transaction.PhoneNumber != "" {
			payment.PhoneNumber = payload.Transaction.PhoneNumber
		}
		if payload.Transaction.Amount.Raw.Int() > 0 {
			payment.AmountUGX = payload.Transaction.Amount.Raw.Int()
		}
		payment.RawPayload = string(rawBody)

		switch payload.EventType {
		case "collection.completed":
			if payment.Status == models.PaymentStatusCompleted {
				return tx.Save(payment).Error
			}
			if payment.UserID == nil {
				return errors.New("payment has no user_id to credit")
			}
			payment.Status = models.PaymentStatusCompleted
			now := time.Now()
			payment.CompletedAt = &now

			var user models.User
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, *payment.UserID).Error; err != nil {
				return err
			}

			switch payment.Purpose {
			case models.PaymentPurposePlan:
				if payment.PlanID == nil || s.billing == nil {
					return errors.New("plan payment has no plan to activate")
				}
				plan, err := s.billing.ActivatePlanTx(tx, &user, *payment.PlanID, payment.Reference, payment.AmountUGX)
				if err != nil {
					return err
				}
				notifyTitle = "Plan Activated"
				notifyMessage = fmt.Sprintf("Your %s plan is active. %d WhatsApp credits were added.", plan.Name, plan.WhatsAppCredits)

			case models.PaymentPurposeWhatsApp:
				user.WhatsAppBalance += payment.WhatsAppCredits
				notifyTitle = "WhatsApp Credits Added"
				notifyMessage = fmt.Sprintf("%d WhatsApp credits were added to your balance.", payment.WhatsAppCredits)

			default:
				if payment.SMSCredits <= 0 {
					price, err := s.smsConfigService.PriceForAmountUGX(payment.AmountUGX)
					if err != nil {
						return err
					}
					payment.PricePerSMS = price
					payment.SMSCredits = payment.AmountUGX / price
				}
				user.SMSBalance += payment.SMSCredits
				user.WhatsAppBalance += payment.WhatsAppCredits

				topup := &models.SMSTopup{
					UserID:      user.ID,
					Amount:      payment.SMSCredits,
					AmountUGX:   payment.AmountUGX,
					PricePerSMS: payment.PricePerSMS,
					Description: "MarzPay collection completed",
					Reference:   payment.Reference,
				}
				if err := tx.Create(topup).Error; err != nil {
					return err
				}
				notifyTitle = "Deposit Completed"
				notifyMessage = fmt.Sprintf("%d SMS credits were added to your balance.", payment.SMSCredits)
				if payment.WhatsAppCredits > 0 {
					notifyMessage += fmt.Sprintf(" Bonus: %d WhatsApp credits.", payment.WhatsAppCredits)
				}
			}

			if err := tx.Save(&user).Error; err != nil {
				return err
			}

			userID = user.ID
			completed = true
			paidPayment = *payment
			paidUser = user
		default:
			if payload.Transaction.Status == models.PaymentStatusFailed || strings.Contains(payload.EventType, "failed") || strings.Contains(payload.EventType, "cancelled") {
				payment.Status = models.PaymentStatusFailed
			} else if payload.Transaction.Status != "" {
				payment.Status = payload.Transaction.Status
			}
		}

		return tx.Save(payment).Error
	})
	if err != nil {
		return err
	}

	if completed {
		s.notifService.Notify(userID, notifyTitle, notifyMessage, "success")
		if s.onTopup != nil {
			s.onTopup(paidPayment, paidUser)
		}
	}
	s.cachePaymentReference(reference)
	return nil
}

func (s *PaymentService) CreateWithdrawal(req *models.CreateWithdrawalRequest) (*models.PaymentTransactionResponse, error) {
	if req.AmountUGX <= 0 {
		return nil, errors.New("amount_ugx must be greater than zero")
	}
	if req.PhoneNumber == "" {
		return nil, errors.New("phone_number is required")
	}

	payment := &models.PaymentTransaction{
		Type:        models.PaymentTypeDisbursement,
		Status:      models.PaymentStatusPending,
		AmountUGX:   req.AmountUGX,
		PhoneNumber: req.PhoneNumber,
		Country:     "UG",
		Reference:   uuid.NewString(),
		Description: req.Description,
	}
	if err := s.repo.Create(payment); err != nil {
		return nil, fmt.Errorf("failed to create withdrawal record: %w", err)
	}
	resp := payment.ToResponse()
	return &resp, nil
}

func (s *PaymentService) GetByReference(reference string, forceSync bool) (*models.PaymentTransactionResponse, error) {
	payment, err := s.repo.FindByReference(reference)
	if err != nil {
		return nil, err
	}

	shouldSync := forceSync || (payment.Type == models.PaymentTypeCollection &&
		payment.Status != models.PaymentStatusCompleted &&
		payment.Status != models.PaymentStatusFailed)

	if shouldSync {
		if syncErr := s.syncCollectionFromMarzPay(payment); syncErr != nil {
			fmt.Printf("MarzPay sync for %s failed: %v\n", reference, syncErr)
		}
		payment, err = s.repo.FindByReference(reference)
		if err != nil {
			return nil, err
		}
	}

	resp := payment.ToResponse()
	s.cachePayment(payment)
	return &resp, nil
}

func (s *PaymentService) syncCollectionFromMarzPay(payment *models.PaymentTransaction) error {
	if payment == nil || s.cfg.MarzPayBasicAuth == "" {
		return nil
	}

	lookupIDs := make([]string, 0, 2)
	if payment.TransactionUUID != "" {
		lookupIDs = append(lookupIDs, payment.TransactionUUID)
	}
	if payment.Reference != "" && payment.Reference != payment.TransactionUUID {
		lookupIDs = append(lookupIDs, payment.Reference)
	}
	if len(lookupIDs) == 0 {
		return errors.New("payment has no transaction identifier for MarzPay lookup")
	}

	var respBody []byte
	var lastErr error
	for _, lookupID := range lookupIDs {
		body, err := s.fetchMarzPayTransaction(lookupID)
		if err != nil {
			lastErr = err
			continue
		}
		respBody = body
		lastErr = nil
		break
	}
	if lastErr != nil {
		return lastErr
	}

	payload, err := parseMarzPayTransactionResponse(respBody, payment.Reference)
	if err != nil {
		return err
	}

	txStatus := strings.ToLower(strings.TrimSpace(payload.Transaction.Status))
	eventType := strings.ToLower(strings.TrimSpace(payload.EventType))
	switch {
	case eventType == "collection.completed" ||
		txStatus == "completed" ||
		txStatus == "successful" ||
		txStatus == "success" ||
		txStatus == "complete":
		payload.EventType = "collection.completed"
		payload.Transaction.Status = models.PaymentStatusCompleted
	case strings.Contains(eventType, "failed") ||
		strings.Contains(eventType, "cancelled") ||
		strings.Contains(eventType, "canceled") ||
		txStatus == models.PaymentStatusFailed ||
		txStatus == "cancelled" ||
		txStatus == "canceled" ||
		txStatus == "declined":
		payload.EventType = "collection.failed"
		payload.Transaction.Status = models.PaymentStatusFailed
	default:
		return nil
	}

	return s.HandleMarzPayWebhook(payload, respBody)
}

func (s *PaymentService) fetchMarzPayTransaction(lookupID string) ([]byte, error) {
	endpoint := strings.TrimRight(s.cfg.MarzPayBaseURL, "/") + "/transactions/" + lookupID
	httpReq, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Authorization", s.marzAuthorizationHeader())

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("MarzPay transaction lookup failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read MarzPay transaction response: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("MarzPay returned status %d: %s", resp.StatusCode, string(respBody))
	}
	return respBody, nil
}

func parseMarzPayTransactionResponse(respBody []byte, fallbackReference string) (*models.MarzPayWebhookPayload, error) {
	var payload models.MarzPayWebhookPayload
	if err := json.Unmarshal(respBody, &payload); err != nil {
		return nil, fmt.Errorf("failed to parse MarzPay transaction response: %w", err)
	}

	if payload.Transaction.Reference == "" && payload.EventType == "" {
		var wrapped struct {
			Data struct {
				Transaction json.RawMessage `json:"transaction"`
				Collection  json.RawMessage `json:"collection"`
			} `json:"data"`
		}
		if err := json.Unmarshal(respBody, &wrapped); err == nil && len(wrapped.Data.Transaction) > 0 {
			_ = json.Unmarshal(wrapped.Data.Transaction, &payload.Transaction)
			if len(wrapped.Data.Collection) > 0 {
				_ = json.Unmarshal(wrapped.Data.Collection, &payload.Collection)
			}
		}
	}

	if payload.Transaction.Reference == "" && fallbackReference != "" {
		payload.Transaction.Reference = fallbackReference
	}
	if payload.Transaction.Reference == "" {
		return nil, errors.New("MarzPay response missing transaction.reference")
	}

	return &payload, nil
}

func (s *PaymentService) List(limit int) ([]models.PaymentTransactionResponse, error) {
	payments, err := s.repo.List(limit)
	if err != nil {
		return nil, err
	}
	res := make([]models.PaymentTransactionResponse, 0, len(payments))
	for i := range payments {
		res = append(res, payments[i].ToResponse())
	}
	return res, nil
}

func (s *PaymentService) UsageSummary() (*models.SMSUsageSummary, error) {
	return s.repo.UsageSummary()
}

func (s *PaymentService) marzAuthorizationHeader() string {
	value := s.cfg.MarzPayBasicAuth
	if strings.HasPrefix(strings.ToLower(value), "basic ") {
		return value
	}
	if strings.Contains(value, ":") {
		value = base64.StdEncoding.EncodeToString([]byte(value))
	}
	return "Basic " + value
}

func (s *PaymentService) marzCallbackURL() string {
	if s.cfg.PublicBaseURL == "" {
		return ""
	}
	return s.cfg.PublicURL("/api/v1/payments/webhooks/marzpay")
}

// Card customers are sent to callback_url after paying, so it must be a page in the web app.
func (s *PaymentService) marzCallbackURLFor(payment *models.PaymentTransaction) string {
	if payment.Method == "card" && s.cfg.FrontendURL != "" {
		return s.cfg.FrontendURL + "/checkout/card/return?reference=" + url.QueryEscape(payment.Reference)
	}
	return s.marzCallbackURL()
}

func (s *PaymentService) cachePayment(payment *models.PaymentTransaction) {
	if payment == nil || s.redisService == nil || !s.redisService.IsActive() {
		return
	}
	resp := payment.ToResponse()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = s.redisService.Set(ctx, fmt.Sprintf("payment:reference:%s", payment.Reference), resp, 30*time.Minute)
}

func (s *PaymentService) cachePaymentReference(reference string) {
	payment, err := s.repo.FindByReference(reference)
	if err != nil {
		return
	}
	s.cachePayment(payment)
}

func marshalRaw(raw map[string]interface{}) string {
	b, err := json.Marshal(raw)
	if err != nil {
		return ""
	}
	return string(b)
}
