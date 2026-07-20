package services

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"backend/internal/config"
	"backend/internal/models"
	"backend/internal/repository"
	"backend/pkg/crypto"
)

// ── JulySMS Constants ───────────────────────────────────────────────────────
const (
	julySMSSendURL    = "https://app.julysms.com/api/v1/sms/send"
	julySMSBalanceURL = "https://app.julysms.com/api/v1/sms/balance"
)

// ── Africa's Talking Constants ──────────────────────────────────────────────
const (
	atSandboxURL    = "https://api.sandbox.africastalking.com/version1/messaging"
	atProductionURL = "https://api.africastalking.com/version1/messaging"
)

// SMSConfigService manages SMS provider configuration and dispatches messages.
type SMSConfigService struct {
	repo         *repository.SMSConfigRepository
	notifService *NotificationService
	cfg          *config.Config
	httpClient   *http.Client
}

// NewSMSConfigService creates a new SMSConfigService.
func NewSMSConfigService(repo *repository.SMSConfigRepository, notifService *NotificationService, cfg *config.Config) *SMSConfigService {
	return &SMSConfigService{
		repo:         repo,
		notifService: notifService,
		cfg:          cfg,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func defaultPricingRanges() []models.SMSPricingRange {
	max9999 := 9999
	max50000 := 50000
	return []models.SMSPricingRange{
		{MinAmount: 0, MaxAmount: &max9999, PricePerSMS: 32},
		{MinAmount: 10000, MaxAmount: &max50000, PricePerSMS: 30},
		{MinAmount: 50001, MaxAmount: nil, PricePerSMS: 27},
	}
}

// maskSecret returns a masked version of a secret string (shows last 4 chars).
func maskSecret(s string) string {
	if len(s) <= 4 {
		return "****"
	}
	return "****" + s[len(s)-4:]
}

// ── Admin Configuration ─────────────────────────────────────────────────────

// GetConfig retrieves the current SMS provider configuration.
func (s *SMSConfigService) GetConfig() (*models.SMSConfigResponse, error) {
	cfg, err := s.repo.Get()
	if err != nil {
		// Return a default config if none exists yet
		defaultResp := &models.SMSConfigResponse{
			ActiveProvider: models.SMSProviderLocal,
			CostPerSegment: 31,
			QueueBatchSize: 100,
		}
		return defaultResp, nil
	}

	// Decrypt secrets for display masking
	decryptedJuly, _ := crypto.Decrypt(cfg.JulySMSClientSecret, s.cfg.JWTSecret)
	decryptedAT, _ := crypto.Decrypt(cfg.ATAPIKey, s.cfg.JWTSecret)

	resp := models.SMSConfigResponse{
		ID:                  cfg.ID,
		ActiveProvider:      cfg.ActiveProvider,
		CostPerSegment:      cfg.CostPerSegment,
		QueueBatchSize:      cfg.QueueBatchSize,
		UpdatedAt:           cfg.UpdatedAt,
		JulySMSClientID:     cfg.JulySMSClientID,
		JulySMSClientSecret: maskSecret(decryptedJuly),
		JulySMSSenderID:     cfg.JulySMSSenderID,
		ATUsername:          cfg.ATUsername,
		ATAPIKey:            maskSecret(decryptedAT),
		ATSenderID:          cfg.ATSenderID,
	}

	return &resp, nil
}

// SaveConfig validates, encrypts, and persists the SMS provider configuration.
func (s *SMSConfigService) SaveConfig(req *models.SMSConfigRequest, adminUserID uint) (*models.SMSConfigResponse, error) {
	// Validate provider-specific required fields
	switch req.ActiveProvider {
	case models.SMSProviderJulySMS:
		if req.JulySMSClientID == "" || req.JulySMSClientSecret == "" {
			return nil, errors.New("JulySMS requires both Client ID and Client Secret")
		}
	case models.SMSProviderAfricasTalking:
		if req.ATUsername == "" || req.ATAPIKey == "" {
			return nil, errors.New("Africa's Talking requires both Username and API Key")
		}
	case models.SMSProviderLocal:
		// No external credentials needed
	default:
		return nil, fmt.Errorf("unsupported SMS provider: %s", req.ActiveProvider)
	}

	// Load existing config to preserve secrets that weren't re-submitted (masked on frontend)
	existing, _ := s.repo.Get()

	cfg := &models.SMSConfig{
		ActiveProvider:      req.ActiveProvider,
		CostPerSegment:      req.CostPerSegment,
		QueueBatchSize:      req.QueueBatchSize,
		JulySMSClientID:     req.JulySMSClientID,
		JulySMSClientSecret: req.JulySMSClientSecret,
		JulySMSSenderID:     req.JulySMSSenderID,
		ATUsername:          req.ATUsername,
		ATAPIKey:            req.ATAPIKey,
		ATSenderID:          req.ATSenderID,
	}

	// If the secret fields come back as masked (****), keep the existing values.
	// Otherwise, encrypt the new secret key.
	if existing != nil {
		if strings.HasPrefix(cfg.JulySMSClientSecret, "****") {
			cfg.JulySMSClientSecret = existing.JulySMSClientSecret
		} else {
			encrypted, err := crypto.Encrypt(cfg.JulySMSClientSecret, s.cfg.JWTSecret)
			if err != nil {
				return nil, fmt.Errorf("failed to encrypt JulySMS client secret: %w", err)
			}
			cfg.JulySMSClientSecret = encrypted
		}

		if strings.HasPrefix(cfg.ATAPIKey, "****") {
			cfg.ATAPIKey = existing.ATAPIKey
		} else {
			encrypted, err := crypto.Encrypt(cfg.ATAPIKey, s.cfg.JWTSecret)
			if err != nil {
				return nil, fmt.Errorf("failed to encrypt Africa's Talking API key: %w", err)
			}
			cfg.ATAPIKey = encrypted
		}
	} else {
		// New config creation, encrypt both
		encryptedJuly, err := crypto.Encrypt(cfg.JulySMSClientSecret, s.cfg.JWTSecret)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt JulySMS client secret: %w", err)
		}
		cfg.JulySMSClientSecret = encryptedJuly

		encryptedAT, err := crypto.Encrypt(cfg.ATAPIKey, s.cfg.JWTSecret)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt Africa's Talking API key: %w", err)
		}
		cfg.ATAPIKey = encryptedAT
	}

	if err := s.repo.Upsert(cfg); err != nil {
		return nil, fmt.Errorf("failed to save SMS config: %w", err)
	}

	// Notify admin about config change
	s.notifService.Notify(adminUserID, "SMS Config Updated",
		fmt.Sprintf("SMS provider configuration updated. Active provider: %s", req.ActiveProvider),
		"info")

	// Return clean response with masked details
	decryptedJuly, _ := crypto.Decrypt(cfg.JulySMSClientSecret, s.cfg.JWTSecret)
	decryptedAT, _ := crypto.Decrypt(cfg.ATAPIKey, s.cfg.JWTSecret)

	resp := models.SMSConfigResponse{
		ID:                  cfg.ID,
		ActiveProvider:      cfg.ActiveProvider,
		CostPerSegment:      cfg.CostPerSegment,
		QueueBatchSize:      cfg.QueueBatchSize,
		UpdatedAt:           cfg.UpdatedAt,
		JulySMSClientID:     cfg.JulySMSClientID,
		JulySMSClientSecret: maskSecret(decryptedJuly),
		JulySMSSenderID:     cfg.JulySMSSenderID,
		ATUsername:          cfg.ATUsername,
		ATAPIKey:            maskSecret(decryptedAT),
		ATSenderID:          cfg.ATSenderID,
	}

	return &resp, nil
}

// GetPricingRanges retrieves configured SMS topup pricing bands or default bands.
func (s *SMSConfigService) GetPricingRanges() ([]models.SMSPricingRangeResponse, error) {
	ranges, err := s.repo.GetPricingRanges()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve pricing ranges: %w", err)
	}
	if len(ranges) == 0 {
		ranges = defaultPricingRanges()
	}

	res := make([]models.SMSPricingRangeResponse, 0, len(ranges))
	for i := range ranges {
		res = append(res, ranges[i].ToResponse())
	}
	return res, nil
}

// SavePricingRanges replaces SMS topup pricing bands after validation.
func (s *SMSConfigService) SavePricingRanges(req []models.SMSPricingRangeRequest, adminUserID uint) ([]models.SMSPricingRangeResponse, error) {
	if len(req) == 0 {
		return nil, errors.New("at least one pricing range is required")
	}

	ranges := make([]models.SMSPricingRange, 0, len(req))
	for _, r := range req {
		if r.MinAmount < 0 {
			return nil, errors.New("min_amount cannot be negative")
		}
		if r.MaxAmount != nil && *r.MaxAmount < r.MinAmount {
			return nil, errors.New("max_amount must be greater than or equal to min_amount")
		}
		if r.PricePerSMS <= 0 {
			return nil, errors.New("price_per_sms must be greater than zero")
		}
		ranges = append(ranges, models.SMSPricingRange{
			MinAmount:   r.MinAmount,
			MaxAmount:   r.MaxAmount,
			PricePerSMS: r.PricePerSMS,
		})
	}

	sort.Slice(ranges, func(i, j int) bool {
		return ranges[i].MinAmount < ranges[j].MinAmount
	})

	for i := 1; i < len(ranges); i++ {
		prev := ranges[i-1]
		current := ranges[i]
		if prev.MaxAmount == nil {
			return nil, errors.New("open-ended pricing range must be the final range")
		}
		if current.MinAmount <= *prev.MaxAmount {
			return nil, errors.New("pricing ranges cannot overlap")
		}
	}

	if err := s.repo.ReplacePricingRanges(ranges); err != nil {
		return nil, fmt.Errorf("failed to save pricing ranges: %w", err)
	}

	s.notifService.Notify(adminUserID, "SMS Pricing Updated", "SMS topup pricing ranges were updated.", "info")
	return s.GetPricingRanges()
}

// PriceForAmountUGX returns the SMS price for a UGX topup amount.
func (s *SMSConfigService) PriceForAmountUGX(amountUGX int) (int, error) {
	if amountUGX < 500 {
		return 0, errors.New("amount_ugx must be at least 500")
	}

	ranges, err := s.repo.GetPricingRanges()
	if err != nil {
		return 0, fmt.Errorf("failed to load SMS pricing ranges: %w", err)
	}
	if len(ranges) == 0 {
		ranges = defaultPricingRanges()
	}

	for _, r := range ranges {
		if amountUGX >= r.MinAmount && (r.MaxAmount == nil || amountUGX <= *r.MaxAmount) {
			return r.PricePerSMS, nil
		}
	}
	return 0, errors.New("amount_ugx is outside configured SMS pricing ranges")
}

// ── SMS Sending ─────────────────────────────────────────────────────────────

// SendSMS dispatches an SMS through the currently active provider.
func (s *SMSConfigService) SendSMS(req *models.SendSMSRequest) (*models.SendSMSResponse, error) {
	cfg, err := s.repo.Get()
	if err != nil {
		return nil, errors.New("SMS provider not configured. Admin must configure SMS settings first")
	}

	switch cfg.ActiveProvider {
	case models.SMSProviderJulySMS:
		return s.sendViaJulySMS(cfg, req)
	case models.SMSProviderAfricasTalking:
		return s.sendViaAfricasTalking(cfg, req)
	case models.SMSProviderLocal:
		return s.sendViaLocal(req)
	default:
		return nil, fmt.Errorf("unsupported active provider: %s", cfg.ActiveProvider)
	}
}

// FormatPhoneNumber formats a phone number specifically for each provider's formatting requirements.
func FormatPhoneNumber(phone string, provider string) string {
	// Strip whitespace, dashes, parentheses
	phone = strings.TrimSpace(phone)
	phone = strings.ReplaceAll(phone, " ", "")
	phone = strings.ReplaceAll(phone, "-", "")
	phone = strings.ReplaceAll(phone, "(", "")
	phone = strings.ReplaceAll(phone, ")", "")

	if provider == "africastalking" {
		// Wants +2567...
		if strings.HasPrefix(phone, "07") {
			return "+256" + phone[1:]
		}
		if strings.HasPrefix(phone, "2567") {
			return "+" + phone
		}
		if strings.HasPrefix(phone, "+2567") {
			return phone
		}
		// Fallback: if it's already + but not 256, keep it. If it's a raw number, try to add +
		if !strings.HasPrefix(phone, "+") {
			return "+" + phone
		}
		return phone
	} else if provider == "julysms" {
		// Wants 2567... (without plus) or 07...
		if strings.HasPrefix(phone, "+2567") {
			return phone[1:] // strip plus -> 2567...
		}
		if strings.HasPrefix(phone, "+") {
			return phone[1:] // strip plus
		}
		return phone
	}
	return phone
}

// ── JulySMS Implementation ──────────────────────────────────────────────────

func (s *SMSConfigService) sendViaJulySMS(cfg *models.SMSConfig, req *models.SendSMSRequest) (*models.SendSMSResponse, error) {
	if cfg.JulySMSClientID == "" || cfg.JulySMSClientSecret == "" {
		return nil, errors.New("JulySMS credentials not configured")
	}

	// Decrypt JulySMS client secret
	clientSecret, err := crypto.Decrypt(cfg.JulySMSClientSecret, s.cfg.JWTSecret)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt JulySMS client secret: %w", err)
	}

	// Build request body — if multiple phones provided use "phones", otherwise "phone"
	body := make(map[string]interface{})
	body["message"] = req.Message

	recipientCount := 0
	if len(req.Phones) > 0 {
		var formattedPhones []string
		for _, p := range req.Phones {
			formattedPhones = append(formattedPhones, FormatPhoneNumber(p, "julysms"))
		}
		body["phones"] = formattedPhones
		recipientCount = len(formattedPhones)
	} else if req.Phone != "" {
		body["phone"] = FormatPhoneNumber(req.Phone, "julysms")
		recipientCount = 1
	} else {
		return nil, errors.New("at least one phone number is required")
	}

	// Add sender ID if configured
	if cfg.JulySMSSenderID != "" {
		body["sender_id"] = cfg.JulySMSSenderID
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal JulySMS request: %w", err)
	}

	httpReq, err := http.NewRequest(http.MethodPost, julySMSSendURL, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create JulySMS request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Client-ID", cfg.JulySMSClientID)
	httpReq.Header.Set("Client-Secret", clientSecret)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("JulySMS request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read JulySMS response: %w", err)
	}

	var rawResp interface{}
	json.Unmarshal(respBody, &rawResp)

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("JulySMS returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return &models.SendSMSResponse{
		Provider:    models.SMSProviderJulySMS,
		Recipients:  recipientCount,
		Message:     "SMS dispatched via JulySMS",
		RawResponse: rawResp,
	}, nil
}

// CheckJulySMSBalance queries the JulySMS balance endpoint.
func (s *SMSConfigService) CheckJulySMSBalance() (*models.SMSBalanceResponse, error) {
	cfg, err := s.repo.Get()
	if err != nil {
		return nil, errors.New("SMS provider not configured")
	}

	if cfg.JulySMSClientID == "" || cfg.JulySMSClientSecret == "" {
		return nil, errors.New("JulySMS credentials not configured")
	}

	// Decrypt JulySMS client secret
	clientSecret, err := crypto.Decrypt(cfg.JulySMSClientSecret, s.cfg.JWTSecret)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt JulySMS client secret: %w", err)
	}

	httpReq, err := http.NewRequest(http.MethodGet, julySMSBalanceURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create balance request: %w", err)
	}

	httpReq.Header.Set("Client-ID", cfg.JulySMSClientID)
	httpReq.Header.Set("Client-Secret", clientSecret)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("JulySMS balance request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read balance response: %w", err)
	}

	var rawResp interface{}
	json.Unmarshal(respBody, &rawResp)

	return &models.SMSBalanceResponse{
		Provider: models.SMSProviderJulySMS,
		Balance:  rawResp,
	}, nil
}

// VerifyJulySMSWebhook validates the HMAC-SHA256 signature on a JulySMS delivery webhook.
func (s *SMSConfigService) VerifyJulySMSWebhook(signature string, rawBody []byte) (bool, error) {
	cfg, err := s.repo.Get()
	if err != nil {
		return false, errors.New("SMS config not found")
	}

	if cfg.JulySMSClientSecret == "" {
		return false, errors.New("JulySMS client secret not configured")
	}

	// Decrypt client secret
	clientSecret, err := crypto.Decrypt(cfg.JulySMSClientSecret, s.cfg.JWTSecret)
	if err != nil {
		return false, fmt.Errorf("failed to decrypt client secret: %w", err)
	}

	mac := hmac.New(sha256.New, []byte(clientSecret))
	mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(expected), []byte(signature)), nil
}

// HandleJulySMSWebhook processes a delivery status webhook from JulySMS.
func (s *SMSConfigService) HandleJulySMSWebhook(status *models.JulySMSDeliveryStatus, rawPayload string) error {
	log := &models.SMSDeliveryLog{
		Provider:    models.SMSProviderJulySMS,
		MessageID:   status.MessageID,
		Phone:       status.Phone,
		Status:      status.Status,
		SentAt:      status.SentAt,
		DeliveredAt: status.DeliveredAt,
		RawPayload:  rawPayload,
	}

	return s.repo.CreateDeliveryLog(log)
}

// ── Africa's Talking Implementation ─────────────────────────────────────────

func (s *SMSConfigService) sendViaAfricasTalking(cfg *models.SMSConfig, req *models.SendSMSRequest) (*models.SendSMSResponse, error) {
	if cfg.ATUsername == "" || cfg.ATAPIKey == "" {
		return nil, errors.New("Africa's Talking credentials not configured")
	}

	// Decrypt API Key
	apiKey, err := crypto.Decrypt(cfg.ATAPIKey, s.cfg.JWTSecret)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt Africa's Talking API key: %w", err)
	}

	// Determine recipient(s)
	var recipients []string
	if len(req.Phones) > 0 {
		for _, p := range req.Phones {
			recipients = append(recipients, FormatPhoneNumber(p, "africastalking"))
		}
	} else if req.Phone != "" {
		recipients = []string{FormatPhoneNumber(req.Phone, "africastalking")}
	} else {
		return nil, errors.New("at least one phone number is required")
	}

	// Build form data (Africa's Talking uses application/x-www-form-urlencoded)
	form := url.Values{}
	form.Set("username", cfg.ATUsername)
	form.Set("to", strings.Join(recipients, ","))
	form.Set("message", req.Message)
	if cfg.ATSenderID != "" {
		form.Set("from", cfg.ATSenderID)
	}

	// Choose endpoint based on username
	endpoint := atProductionURL
	if cfg.ATUsername == "sandbox" {
		endpoint = atSandboxURL
	}

	httpReq, err := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create AT request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	httpReq.Header.Set("apiKey", apiKey)
	httpReq.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("Africa's Talking request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read AT response: %w", err)
	}

	var rawResp interface{}
	json.Unmarshal(respBody, &rawResp)

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("Africa's Talking returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return &models.SendSMSResponse{
		Provider:    models.SMSProviderAfricasTalking,
		Recipients:  len(recipients),
		Message:     "SMS dispatched via Africa's Talking",
		RawResponse: rawResp,
	}, nil
}

// ── Local Provider (No-op / Logging) ────────────────────────────────────────

func (s *SMSConfigService) sendViaLocal(req *models.SendSMSRequest) (*models.SendSMSResponse, error) {
	recipientCount := 0
	if len(req.Phones) > 0 {
		recipientCount = len(req.Phones)
	} else if req.Phone != "" {
		recipientCount = 1
	} else {
		return nil, errors.New("at least one phone number is required")
	}

	fmt.Printf("📱 [LOCAL SMS] To: %s | Phones: %v | Message: %s\n", req.Phone, req.Phones, req.Message)

	return &models.SendSMSResponse{
		Provider:   models.SMSProviderLocal,
		Recipients: recipientCount,
		Message:    "SMS recorded locally (no external gateway called)",
	}, nil
}

// ── Delivery Logs ───────────────────────────────────────────────────────────

// GetDeliveryLogs retrieves recent delivery status logs.
func (s *SMSConfigService) GetDeliveryLogs(limit int) ([]models.SMSDeliveryLog, error) {
	return s.repo.FindDeliveryLogs(limit)
}
