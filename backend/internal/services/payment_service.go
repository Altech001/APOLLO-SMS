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

func (s *PaymentService) CreateCollection(userID uint, req *models.CreateCollectionRequest) (*models.CreateCollectionResponse, error) {
	if req.AmountUGX < 500 || req.AmountUGX > 10000000 {
		return nil, errors.New("amount_ugx must be between 500 and 10000000")
	}
	method := req.Method
	if method == "" {
		method = "mobile_money"
	}
	if method != "mobile_money" && method != "card" {
		return nil, errors.New("method must be mobile_money or card")
	}
	if method == "mobile_money" && req.PhoneNumber == "" {
		return nil, errors.New("phone_number is required for mobile money collections")
	}
	if s.cfg.MarzPayBasicAuth == "" {
		return nil, errors.New("MARZPAY_BASIC_AUTH is not configured")
	}

	pricePerSMS, err := s.smsConfigService.PriceForAmountUGX(req.AmountUGX)
	if err != nil {
		return nil, err
	}
	smsCredits := req.AmountUGX / pricePerSMS
	reference := uuid.NewString()

	payment := &models.PaymentTransaction{
		UserID:      &userID,
		Type:        models.PaymentTypeCollection,
		Status:      models.PaymentStatusPending,
		AmountUGX:   req.AmountUGX,
		SMSCredits:  smsCredits,
		PricePerSMS: pricePerSMS,
		PhoneNumber: req.PhoneNumber,
		Country:     "UG",
		Method:      method,
		Reference:   reference,
		Description: req.Description,
	}
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
	if txData, ok := rawResp["data"].(map[string]interface{}); ok {
		if transaction, ok := txData["transaction"].(map[string]interface{}); ok {
			if val, ok := transaction["uuid"].(string); ok {
				payment.TransactionUUID = val
			}
			if val, ok := transaction["status"].(string); ok && val != "" {
				payment.Status = val
			}
		}
	}
	if err := s.db.Save(payment).Error; err != nil {
		return nil, fmt.Errorf("failed to update payment record: %w", err)
	}
	s.cachePayment(payment)

	return &models.CreateCollectionResponse{
		Reference:   payment.Reference,
		Status:      payment.Status,
		AmountUGX:   payment.AmountUGX,
		SMSCredits:  payment.SMSCredits,
		PricePerSMS: payment.PricePerSMS,
		RawResponse: rawResp,
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
	if callbackURL := s.marzCallbackURL(); callbackURL != "" {
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
	var smsCredits int
	var completed bool

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
		if payload.Transaction.Amount.Raw > 0 {
			payment.AmountUGX = payload.Transaction.Amount.Raw
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

			if payment.SMSCredits <= 0 {
				price, err := s.smsConfigService.PriceForAmountUGX(payment.AmountUGX)
				if err != nil {
					return err
				}
				payment.PricePerSMS = price
				payment.SMSCredits = payment.AmountUGX / price
			}

			var user models.User
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, *payment.UserID).Error; err != nil {
				return err
			}
			user.SMSBalance += payment.SMSCredits
			if err := tx.Save(&user).Error; err != nil {
				return err
			}

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

			userID = user.ID
			smsCredits = payment.SMSCredits
			completed = true
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
		s.notifService.Notify(userID, "Deposit Completed", fmt.Sprintf("%d SMS credits were added to your balance.", smsCredits), "success")
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

func (s *PaymentService) GetByReference(reference string) (*models.PaymentTransactionResponse, error) {
	var cached models.PaymentTransactionResponse
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if s.redisService != nil && s.redisService.IsActive() {
		if err := s.redisService.Get(ctx, fmt.Sprintf("payment:reference:%s", reference), &cached); err == nil {
			return &cached, nil
		}
	}

	payment, err := s.repo.FindByReference(reference)
	if err != nil {
		return nil, err
	}
	resp := payment.ToResponse()
	if s.redisService != nil && s.redisService.IsActive() {
		_ = s.redisService.Set(ctx, fmt.Sprintf("payment:reference:%s", reference), resp, 30*time.Minute)
	}
	return &resp, nil
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
	return strings.TrimRight(s.cfg.PublicBaseURL, "/") + "/api/v1/payments/webhooks/marzpay"
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
