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
	"log"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
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

	healthMu sync.Mutex
	failedAt map[string]time.Time // provider -> time of its last failed send
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
	if s == "" {
		return ""
	}
	if len(s) <= 4 {
		return "****"
	}
	return "****" + s[len(s)-4:]
}

func decryptConfiguredSecret(cipherText string, secretKey string) (string, bool) {
	if cipherText == "" {
		return "", false
	}
	plainText, err := crypto.Decrypt(cipherText, secretKey)
	if err != nil || plainText == "" {
		return "", false
	}
	return plainText, true
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

	decryptedJuly, julyConfigured := decryptConfiguredSecret(cfg.JulySMSClientSecret, s.cfg.JWTSecret)
	decryptedAT, atConfigured := decryptConfiguredSecret(cfg.ATAPIKey, s.cfg.JWTSecret)
	decryptedFuxx, fuxxConfigured := decryptConfiguredSecret(cfg.FuxxPassword, s.cfg.JWTSecret)

	resp := models.SMSConfigResponse{
		ID:                            cfg.ID,
		ActiveProvider:                cfg.ActiveProvider,
		CostPerSegment:                cfg.CostPerSegment,
		QueueBatchSize:                cfg.QueueBatchSize,
		UpdatedAt:                     cfg.UpdatedAt,
		JulySMSClientID:               cfg.JulySMSClientID,
		JulySMSClientSecret:           maskSecret(decryptedJuly),
		JulySMSClientSecretConfigured: julyConfigured,
		JulySMSSenderID:               cfg.JulySMSSenderID,
		ATUsername:                    cfg.ATUsername,
		ATAPIKey:                      maskSecret(decryptedAT),
		ATAPIKeyConfigured:            atConfigured,
		ATSenderID:                    cfg.ATSenderID,
		FuxxBaseURL:                   cfg.FuxxBaseURL,
		FuxxUsername:                  cfg.FuxxUsername,
		FuxxPassword:                  maskSecret(decryptedFuxx),
		FuxxPasswordConfigured:        fuxxConfigured,
	}

	return &resp, nil
}

// GetPublicPricing returns the per-segment SMS rate for authenticated users.
func (s *SMSConfigService) GetPublicPricing() (*models.SMSPublicPricingResponse, error) {
	cfg, err := s.GetConfig()
	if err != nil {
		return nil, err
	}
	return &models.SMSPublicPricingResponse{
		CostPerSegment: cfg.CostPerSegment,
	}, nil
}

// SaveConfig validates, encrypts, and persists the SMS provider configuration.
func (s *SMSConfigService) SaveConfig(req *models.SMSConfigRequest, adminUserID uint) (*models.SMSConfigResponse, error) {
	switch req.ActiveProvider {
	case models.SMSProviderLocal, models.SMSProviderJulySMS, models.SMSProviderAfricasTalking, models.SMSProviderFuxx:
	default:
		return nil, fmt.Errorf("unsupported SMS provider: %s", req.ActiveProvider)
	}

	scope := strings.TrimSpace(req.UpdateScope)
	if scope == "" {
		scope = "all"
	}
	switch scope {
	case "all", "general", models.SMSProviderJulySMS, models.SMSProviderAfricasTalking, models.SMSProviderFuxx:
	default:
		return nil, fmt.Errorf("unsupported SMS config update scope: %s", scope)
	}

	// Load existing config first so scoped admin updates cannot wipe the other provider.
	existing, _ := s.repo.Get()
	cfg := &models.SMSConfig{
		ActiveProvider: models.SMSProviderLocal,
		CostPerSegment: 31,
		QueueBatchSize: 100,
	}
	if existing != nil {
		cfg = existing
	}

	cfg.ActiveProvider = req.ActiveProvider
	cfg.CostPerSegment = req.CostPerSegment
	cfg.QueueBatchSize = req.QueueBatchSize

	if scope == "all" || scope == models.SMSProviderJulySMS {
		cfg.JulySMSClientID = req.JulySMSClientID
		cfg.JulySMSSenderID = req.JulySMSSenderID
		if req.JulySMSClientSecret != "" && !strings.HasPrefix(req.JulySMSClientSecret, "****") {
			encrypted, err := crypto.Encrypt(req.JulySMSClientSecret, s.cfg.JWTSecret)
			if err != nil {
				return nil, fmt.Errorf("failed to encrypt JulySMS client secret: %w", err)
			}
			cfg.JulySMSClientSecret = encrypted
		}
	}

	if scope == "all" || scope == models.SMSProviderAfricasTalking {
		cfg.ATUsername = req.ATUsername
		cfg.ATSenderID = req.ATSenderID
		if req.ATAPIKey != "" && !strings.HasPrefix(req.ATAPIKey, "****") {
			encrypted, err := crypto.Encrypt(req.ATAPIKey, s.cfg.JWTSecret)
			if err != nil {
				return nil, fmt.Errorf("failed to encrypt Africa's Talking API key: %w", err)
			}
			cfg.ATAPIKey = encrypted
		}
	}

	if scope == "all" || scope == models.SMSProviderFuxx {
		cfg.FuxxBaseURL = strings.TrimSpace(req.FuxxBaseURL)
		cfg.FuxxUsername = strings.TrimSpace(req.FuxxUsername)
		if req.FuxxPassword != "" && !strings.HasPrefix(req.FuxxPassword, "****") {
			encrypted, err := crypto.Encrypt(req.FuxxPassword, s.cfg.JWTSecret)
			if err != nil {
				return nil, fmt.Errorf("failed to encrypt FUXX password: %w", err)
			}
			cfg.FuxxPassword = encrypted
		}
	}

	if cfg.CostPerSegment <= 0 {
		return nil, errors.New("cost_per_segment must be greater than zero")
	}
	if cfg.QueueBatchSize <= 0 {
		return nil, errors.New("queue_batch_size must be greater than zero")
	}

	decryptedJuly, julyConfigured := decryptConfiguredSecret(cfg.JulySMSClientSecret, s.cfg.JWTSecret)
	decryptedAT, atConfigured := decryptConfiguredSecret(cfg.ATAPIKey, s.cfg.JWTSecret)
	decryptedFuxx, fuxxConfigured := decryptConfiguredSecret(cfg.FuxxPassword, s.cfg.JWTSecret)

	switch cfg.ActiveProvider {
	case models.SMSProviderJulySMS:
		if cfg.JulySMSClientID == "" || !julyConfigured {
			return nil, errors.New("JulySMS requires both Client ID and Client Secret")
		}
	case models.SMSProviderAfricasTalking:
		if cfg.ATUsername == "" || !atConfigured {
			return nil, errors.New("Africa's Talking requires both Username and API Key")
		}
	case models.SMSProviderFuxx:
		if cfg.FuxxBaseURL == "" || cfg.FuxxUsername == "" || !fuxxConfigured {
			return nil, errors.New("FUXX requires URL, Username, and Password")
		}
	}

	if err := s.repo.Upsert(cfg); err != nil {
		return nil, fmt.Errorf("failed to save SMS config: %w", err)
	}

	if s.notifService != nil && adminUserID > 0 {
		message := fmt.Sprintf("SMS provider configuration updated. Active provider: %s", cfg.ActiveProvider)
		if scope != "all" {
			message = fmt.Sprintf("SMS %s settings updated. Active provider: %s", scope, cfg.ActiveProvider)
		}
		s.notifService.Notify(adminUserID, "SMS Config Updated", message, "info")
	}

	resp := models.SMSConfigResponse{
		ID:                            cfg.ID,
		ActiveProvider:                cfg.ActiveProvider,
		CostPerSegment:                cfg.CostPerSegment,
		QueueBatchSize:                cfg.QueueBatchSize,
		UpdatedAt:                     cfg.UpdatedAt,
		JulySMSClientID:               cfg.JulySMSClientID,
		JulySMSClientSecret:           maskSecret(decryptedJuly),
		JulySMSClientSecretConfigured: julyConfigured,
		JulySMSSenderID:               cfg.JulySMSSenderID,
		ATUsername:                    cfg.ATUsername,
		ATAPIKey:                      maskSecret(decryptedAT),
		ATAPIKeyConfigured:            atConfigured,
		ATSenderID:                    cfg.ATSenderID,
		FuxxBaseURL:                   cfg.FuxxBaseURL,
		FuxxUsername:                  cfg.FuxxUsername,
		FuxxPassword:                  maskSecret(decryptedFuxx),
		FuxxPasswordConfigured:        fuxxConfigured,
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

// providerFailureCooldown is how long a provider that just failed is tried last instead of first.
const providerFailureCooldown = 2 * time.Minute

// SendSMS dispatches an SMS through the active provider and fails over to every other configured
// provider when it errors or reports low credit. A provider that failed recently is moved to the end
// of the order so repeated sends don't wait on a gateway that is known to be down.
func (s *SMSConfigService) SendSMS(req *models.SendSMSRequest) (*models.SendSMSResponse, error) {
	cfg, err := s.repo.Get()
	if err != nil {
		return nil, errors.New("SMS provider not configured. Admin must configure SMS settings first")
	}

	order := s.providerOrder(cfg)
	if len(order) == 0 {
		return nil, fmt.Errorf("unsupported active provider: %s", cfg.ActiveProvider)
	}

	var failures []string
	for _, provider := range order {
		resp, err := s.sendVia(provider, cfg, req)
		if err == nil {
			s.markProviderHealthy(provider)
			if len(failures) > 0 {
				log.Printf("📱 SMS failover: sent via %s after %s", provider, strings.Join(failures, "; "))
			}
			return resp, nil
		}
		s.markProviderFailed(provider)
		failures = append(failures, fmt.Sprintf("%s: %v", provider, err))
		log.Printf("⚠️  SMS provider %s failed: %v", provider, err)
	}
	return nil, fmt.Errorf("all SMS providers failed (%s)", strings.Join(failures, "; "))
}

func (s *SMSConfigService) sendVia(provider string, cfg *models.SMSConfig, req *models.SendSMSRequest) (*models.SendSMSResponse, error) {
	switch provider {
	case models.SMSProviderJulySMS:
		return s.sendViaJulySMS(cfg, req)
	case models.SMSProviderAfricasTalking:
		return s.sendViaAfricasTalking(cfg, req)
	case models.SMSProviderFuxx:
		return s.sendViaFuxx(cfg, req)
	case models.SMSProviderLocal:
		return s.sendViaLocal(req)
	default:
		return nil, fmt.Errorf("unsupported provider: %s", provider)
	}
}

// providerOrder lists the providers to try: the active one, then the other configured gateways.
// The local (log-only) provider never takes part in failover.
func (s *SMSConfigService) providerOrder(cfg *models.SMSConfig) []string {
	if cfg.ActiveProvider == models.SMSProviderLocal {
		return []string{models.SMSProviderLocal}
	}

	candidates := []string{cfg.ActiveProvider}
	for _, p := range []string{models.SMSProviderJulySMS, models.SMSProviderAfricasTalking, models.SMSProviderFuxx} {
		if p != cfg.ActiveProvider {
			candidates = append(candidates, p)
		}
	}

	var healthy, cooling []string
	for _, p := range candidates {
		if !s.providerConfigured(p, cfg) {
			continue
		}
		if s.providerCoolingDown(p) {
			cooling = append(cooling, p)
		} else {
			healthy = append(healthy, p)
		}
	}
	return append(healthy, cooling...)
}

func (s *SMSConfigService) providerConfigured(provider string, cfg *models.SMSConfig) bool {
	switch provider {
	case models.SMSProviderJulySMS:
		return cfg.JulySMSClientID != "" && cfg.JulySMSClientSecret != ""
	case models.SMSProviderAfricasTalking:
		return cfg.ATUsername != "" && cfg.ATAPIKey != ""
	case models.SMSProviderFuxx:
		return cfg.FuxxBaseURL != "" && cfg.FuxxUsername != "" && cfg.FuxxPassword != ""
	}
	return false
}

func (s *SMSConfigService) markProviderFailed(provider string) {
	s.healthMu.Lock()
	defer s.healthMu.Unlock()
	if s.failedAt == nil {
		s.failedAt = make(map[string]time.Time)
	}
	s.failedAt[provider] = time.Now()
}

func (s *SMSConfigService) markProviderHealthy(provider string) {
	s.healthMu.Lock()
	defer s.healthMu.Unlock()
	delete(s.failedAt, provider)
}

func (s *SMSConfigService) providerCoolingDown(provider string) bool {
	s.healthMu.Lock()
	defer s.healthMu.Unlock()
	failedAt, ok := s.failedAt[provider]
	return ok && time.Since(failedAt) < providerFailureCooldown
}

// lowCreditPattern matches gateway messages that mean the account is out of credit.
var lowCreditPattern = regexp.MustCompile(`(?i)insufficient|low (credit|balance)|no (credit|balance)|out of (credit|balance)|not enough`)

// julySMSSoftFailure reports an error when JulySMS answers 2xx but the body says the send failed.
func julySMSSoftFailure(raw interface{}, body []byte) error {
	obj, ok := raw.(map[string]interface{})
	if !ok {
		return nil
	}
	if success, ok := obj["success"].(bool); ok && !success {
		return fmt.Errorf("JulySMS rejected the send: %s", string(body))
	}
	if status, ok := obj["status"].(string); ok && (strings.EqualFold(status, "error") || strings.EqualFold(status, "failed")) {
		return fmt.Errorf("JulySMS rejected the send: %s", string(body))
	}
	if lowCreditPattern.Match(body) {
		return fmt.Errorf("JulySMS reports low credit: %s", string(body))
	}
	return nil
}

// atSoftFailure reports an error when Africa's Talking accepted the request but every recipient
// failed (e.g. InsufficientBalance). Partial success is not an error, so failover never re-sends
// to recipients that already got the message.
func atSoftFailure(raw interface{}, body []byte) error {
	obj, ok := raw.(map[string]interface{})
	if !ok {
		return nil
	}
	data, ok := obj["SMSMessageData"].(map[string]interface{})
	if !ok {
		return nil
	}
	recipients, _ := data["Recipients"].([]interface{})
	if len(recipients) == 0 {
		return fmt.Errorf("Africa's Talking sent to no recipients: %v", data["Message"])
	}
	for _, r := range recipients {
		rec, _ := r.(map[string]interface{})
		if status, _ := rec["status"].(string); strings.EqualFold(status, "Success") || strings.EqualFold(status, "Sent") {
			return nil
		}
	}
	first, _ := recipients[0].(map[string]interface{})
	return fmt.Errorf("Africa's Talking failed for all recipients: %v", first["status"])
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
	} else if provider == "fuxx" {
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
	if err := julySMSSoftFailure(rawResp, respBody); err != nil {
		return nil, err
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

// CheckAfricasTalkingBalance reads the Africa's Talking account balance, e.g. "UGX 15000.0000".
func (s *SMSConfigService) CheckAfricasTalkingBalance() (*models.SMSBalanceResponse, error) {
	cfg, err := s.repo.Get()
	if err != nil {
		return nil, errors.New("SMS provider not configured")
	}
	if cfg.ATUsername == "" || cfg.ATAPIKey == "" {
		return nil, errors.New("Africa's Talking credentials not configured")
	}
	apiKey, err := crypto.Decrypt(cfg.ATAPIKey, s.cfg.JWTSecret)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt Africa's Talking API key: %w", err)
	}

	base := "https://api.africastalking.com"
	if cfg.ATUsername == "sandbox" {
		base = "https://api.sandbox.africastalking.com"
	}
	httpReq, err := http.NewRequest(http.MethodGet, base+"/version1/user?username="+url.QueryEscape(cfg.ATUsername), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create balance request: %w", err)
	}
	httpReq.Header.Set("apiKey", apiKey)
	httpReq.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("Africa's Talking balance request failed: %w", err)
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read balance response: %w", err)
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Africa's Talking balance request failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var rawResp interface{}
	json.Unmarshal(respBody, &rawResp)
	return &models.SMSBalanceResponse{
		Provider: models.SMSProviderAfricasTalking,
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
	if err := atSoftFailure(rawResp, respBody); err != nil {
		return nil, err
	}

	return &models.SendSMSResponse{
		Provider:    models.SMSProviderAfricasTalking,
		Recipients:  len(recipients),
		Message:     "SMS dispatched via Africa's Talking",
		RawResponse: rawResp,
	}, nil
}

// ── FUXX Cloud Gateway Implementation ──────────────────────────────────────

func fuxxMessageURL(baseURL string) (string, error) {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmed == "" {
		return "", errors.New("FUXX URL is required")
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("FUXX URL must be a valid absolute URL")
	}

	if strings.HasSuffix(parsed.Path, "/3rdparty/v1/message") {
		return parsed.String(), nil
	}
	if strings.HasSuffix(parsed.Path, "/3rdparty/v1") {
		parsed.Path = strings.TrimRight(parsed.Path, "/") + "/message"
		return parsed.String(), nil
	}

	parsed.Path = "/3rdparty/v1/message"
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}

func (s *SMSConfigService) sendViaFuxx(cfg *models.SMSConfig, req *models.SendSMSRequest) (*models.SendSMSResponse, error) {
	if cfg.FuxxBaseURL == "" || cfg.FuxxUsername == "" || cfg.FuxxPassword == "" {
		return nil, errors.New("FUXX credentials not configured")
	}

	password, err := crypto.Decrypt(cfg.FuxxPassword, s.cfg.JWTSecret)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt FUXX password: %w", err)
	}

	var recipients []string
	if len(req.Phones) > 0 {
		for _, p := range req.Phones {
			recipients = append(recipients, FormatPhoneNumber(p, models.SMSProviderFuxx))
		}
	} else if req.Phone != "" {
		recipients = []string{FormatPhoneNumber(req.Phone, models.SMSProviderFuxx)}
	} else {
		return nil, errors.New("at least one phone number is required")
	}

	endpoint, err := fuxxMessageURL(cfg.FuxxBaseURL)
	if err != nil {
		return nil, err
	}

	body := map[string]interface{}{
		"phoneNumbers": recipients,
		"textMessage": map[string]string{
			"text": req.Message,
		},
	}
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal FUXX request: %w", err)
	}

	httpReq, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create FUXX request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")
	httpReq.SetBasicAuth(cfg.FuxxUsername, password)

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("FUXX request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read FUXX response: %w", err)
	}

	var rawResp interface{}
	if err := json.Unmarshal(respBody, &rawResp); err != nil {
		rawResp = string(respBody)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("FUXX returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return &models.SendSMSResponse{
		Provider:    models.SMSProviderFuxx,
		Recipients:  len(recipients),
		Message:     "SMS dispatched via FUXX",
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
