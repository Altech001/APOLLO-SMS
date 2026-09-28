package services

import (
	"errors"
	"fmt"
	"html"
	"log"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"backend/internal/models"
	"backend/pkg/email"

	"gorm.io/gorm"
)

// lowBalanceRepeat is how long to wait before repeating a low-balance alert for the same provider.
const lowBalanceRepeat = 6 * time.Hour

// AdminService owns the profit report, provider balances and admin alerts.
type AdminService struct {
	db        *gorm.DB
	smsConfig *SMSConfigService
	whatsapp  *WhatsAppService
	email     *email.EmailSender
}

// NewAdminService creates an AdminService.
func NewAdminService(db *gorm.DB, smsConfig *SMSConfigService, whatsapp *WhatsAppService, emailSender *email.EmailSender) *AdminService {
	return &AdminService{db: db, smsConfig: smsConfig, whatsapp: whatsapp, email: emailSender}
}

// ── Settings ───────────────────────────────────────────────────────────────

// Settings returns the admin settings row, creating it with defaults when missing.
func (s *AdminService) Settings() (*models.AdminSettings, error) {
	var settings models.AdminSettings
	err := s.db.Order("id asc").Limit(1).Find(&settings).Error
	if err != nil {
		return nil, err
	}
	if settings.ID == 0 {
		settings = models.AdminSettings{
			JulySMSCostUGX: 20, AfricasTalkingCost: 27,
			EmailEnabled: true, SMSEnabled: true, WhatsAppEnabled: true, NotifyOnTopup: true,
		}
		if err := s.db.Create(&settings).Error; err != nil {
			return nil, err
		}
	}
	return &settings, nil
}

// SaveSettings updates the admin settings. The saving admin's linked WhatsApp number sends WhatsApp alerts.
func (s *AdminService) SaveSettings(adminID uint, req *models.AdminSettingsRequest) (*models.AdminSettings, error) {
	for _, v := range []int{req.JulySMSCostUGX, req.AfricasTalkingCost, req.OtherProviderCostUGX} {
		if v < 0 {
			return nil, errors.New("costs cannot be negative")
		}
	}
	if req.JulySMSThreshold < 0 || req.AfricasTalkingLimit < 0 {
		return nil, errors.New("thresholds cannot be negative")
	}
	settings, err := s.Settings()
	if err != nil {
		return nil, err
	}
	settings.JulySMSCostUGX = req.JulySMSCostUGX
	settings.AfricasTalkingCost = req.AfricasTalkingCost
	settings.OtherProviderCostUGX = req.OtherProviderCostUGX
	settings.AlertEmail = strings.TrimSpace(req.AlertEmail)
	settings.AlertPhone = strings.TrimSpace(req.AlertPhone)
	settings.AlertWhatsApp = strings.TrimSpace(req.AlertWhatsApp)
	settings.EmailEnabled = req.EmailEnabled
	settings.SMSEnabled = req.SMSEnabled
	settings.WhatsAppEnabled = req.WhatsAppEnabled
	settings.NotifyOnTopup = req.NotifyOnTopup
	if settings.JulySMSThreshold != req.JulySMSThreshold {
		settings.JulySMSAlertedAt = nil
	}
	if settings.AfricasTalkingLimit != req.AfricasTalkingLimit {
		settings.AfricasTalkingAlerted = nil
	}
	settings.JulySMSThreshold = req.JulySMSThreshold
	settings.AfricasTalkingLimit = req.AfricasTalkingLimit
	settings.WhatsAppSenderUserID = adminID
	if err := s.db.Save(settings).Error; err != nil {
		return nil, err
	}
	return settings, nil
}

func (s *AdminService) unitCost(settings *models.AdminSettings, provider string) int {
	switch provider {
	case models.SMSProviderJulySMS:
		return settings.JulySMSCostUGX
	case models.SMSProviderAfricasTalking:
		return settings.AfricasTalkingCost
	case models.SMSProviderLocal, "":
		return 0
	default:
		return settings.OtherProviderCostUGX
	}
}

// ── Profit ─────────────────────────────────────────────────────────────────

// Profit builds the revenue and profit report since `from` (nil = all time).
// Revenue is money collected; SMS cost is segments actually sent times each provider's price.
// WhatsApp and plan revenue have no provider cost, so they are counted as profit.
func (s *AdminService) Profit(from *time.Time, chartDays int) (*models.ProfitSummary, error) {
	settings, err := s.Settings()
	if err != nil {
		return nil, err
	}
	out := &models.ProfitSummary{From: from, To: time.Now(), Providers: []models.ProviderUsage{}, Daily: []models.ProfitDay{}}

	since := time.Time{}
	if from != nil {
		since = *from
	}

	type purposeRow struct {
		Purpose string
		Amount  int64
		Credits int64
		Count   int64
	}
	var purposes []purposeRow
	if err := s.db.Model(&models.PaymentTransaction{}).
		Select("purpose, COALESCE(SUM(amount_ugx),0) AS amount, COALESCE(SUM(sms_credits),0) AS credits, COUNT(*) AS count").
		Where("type = ? AND status = ? AND COALESCE(completed_at, created_at) >= ?", models.PaymentTypeCollection, models.PaymentStatusCompleted, since).
		Group("purpose").Scan(&purposes).Error; err != nil {
		return nil, err
	}
	var smsCredits int64
	for _, p := range purposes {
		out.Topups += p.Count
		switch p.Purpose {
		case models.PaymentPurposePlan:
			out.PlanRevenueUGX += p.Amount
		case models.PaymentPurposeWhatsApp:
			out.WhatsAppRevenueUGX += p.Amount
		default:
			out.SMSRevenueUGX += p.Amount
			smsCredits += p.Credits
		}
	}
	s.db.Model(&models.PaymentTransaction{}).
		Where("type = ? AND status = ? AND COALESCE(completed_at, created_at) >= ?", models.PaymentTypeCollection, models.PaymentStatusCompleted, since).
		Distinct("user_id").Count(&out.PayingUsers)

	out.AvgSellPriceUGX = s.avgSellPrice(out.SMSRevenueUGX, smsCredits)

	type usageRow struct {
		Provider string
		Source   string
		Messages int64
		Segments int64
	}
	var usage []usageRow
	if err := s.db.Model(&models.SMSMessage{}).
		Select("provider, COALESCE(NULLIF(source, ''), 'app') AS source, COUNT(*) AS messages, COALESCE(SUM(segments),0) AS segments").
		Where("status IN ? AND created_at >= ?", []string{models.SMSMessageStatusSent, models.SMSMessageStatusDelivered}, since).
		Group("provider, COALESCE(NULLIF(source, ''), 'app')").Scan(&usage).Error; err != nil {
		return nil, err
	}
	for _, u := range usage {
		cost := s.unitCost(settings, u.Provider)
		row := models.ProviderUsage{
			Provider: u.Provider, Source: u.Source, Messages: u.Messages, Segments: u.Segments,
			UnitCost: cost, CostUGX: u.Segments * int64(cost),
			RevenueUGX: int64(float64(u.Segments) * out.AvgSellPriceUGX),
		}
		out.Providers = append(out.Providers, row)
		out.SMSCostUGX += row.CostUGX
		if u.Source == "api" {
			out.APISegments += u.Segments
			out.APICostUGX += row.CostUGX
			out.APIRevenueUGX += row.RevenueUGX
		} else {
			out.AppSegments += u.Segments
			out.AppCostUGX += row.CostUGX
			out.AppRevenueUGX += row.RevenueUGX
		}
	}
	sort.Slice(out.Providers, func(i, j int) bool { return out.Providers[i].Segments > out.Providers[j].Segments })

	s.db.Model(&models.WhatsAppMessage{}).Where("status = ? AND created_at >= ?", models.WhatsAppMessageSent, since).Count(&out.WhatsAppSent)

	out.TotalRevenueUGX = out.SMSRevenueUGX + out.PlanRevenueUGX + out.WhatsAppRevenueUGX
	out.SMSProfitUGX = out.SMSRevenueUGX - out.SMSCostUGX
	out.TotalProfitUGX = out.TotalRevenueUGX - out.SMSCostUGX

	daily, err := s.daily(settings, chartDays)
	if err != nil {
		return nil, err
	}
	out.Daily = daily
	return out, nil
}

func (s *AdminService) avgSellPrice(revenue, credits int64) float64 {
	if credits > 0 && revenue > 0 {
		return float64(revenue) / float64(credits)
	}
	var all struct {
		Amount  int64
		Credits int64
	}
	s.db.Model(&models.PaymentTransaction{}).
		Select("COALESCE(SUM(amount_ugx),0) AS amount, COALESCE(SUM(sms_credits),0) AS credits").
		Where("type = ? AND status = ? AND purpose = ?", models.PaymentTypeCollection, models.PaymentStatusCompleted, models.PaymentPurposeSMS).
		Scan(&all)
	if all.Credits > 0 && all.Amount > 0 {
		return float64(all.Amount) / float64(all.Credits)
	}
	if s.smsConfig != nil {
		if price, err := s.smsConfig.PriceForAmountUGX(minCollectionUGX); err == nil {
			return float64(price)
		}
	}
	return 0
}

func (s *AdminService) daily(settings *models.AdminSettings, days int) ([]models.ProfitDay, error) {
	if days <= 0 {
		days = 30
	}
	start := time.Now().AddDate(0, 0, -(days - 1))
	start = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, start.Location())

	points := make([]models.ProfitDay, days)
	index := map[string]int{}
	for i := range points {
		day := start.AddDate(0, 0, i).Format("2006-01-02")
		points[i].Day = day
		index[day] = i
	}

	type revRow struct {
		Day    string
		Amount int64
	}
	var revenue []revRow
	if err := s.db.Model(&models.PaymentTransaction{}).
		Select("TO_CHAR(COALESCE(completed_at, created_at), 'YYYY-MM-DD') AS day, COALESCE(SUM(amount_ugx),0) AS amount").
		Where("type = ? AND status = ? AND COALESCE(completed_at, created_at) >= ?", models.PaymentTypeCollection, models.PaymentStatusCompleted, start).
		Group("day").Scan(&revenue).Error; err != nil {
		return nil, err
	}
	for _, r := range revenue {
		if i, ok := index[r.Day]; ok {
			points[i].RevenueUGX += r.Amount
		}
	}

	type costRow struct {
		Day      string
		Provider string
		Segments int64
	}
	var costs []costRow
	if err := s.db.Model(&models.SMSMessage{}).
		Select("TO_CHAR(created_at, 'YYYY-MM-DD') AS day, provider, COALESCE(SUM(segments),0) AS segments").
		Where("status IN ? AND created_at >= ?", []string{models.SMSMessageStatusSent, models.SMSMessageStatusDelivered}, start).
		Group("day, provider").Scan(&costs).Error; err != nil {
		return nil, err
	}
	for _, c := range costs {
		if i, ok := index[c.Day]; ok {
			points[i].SMSCostUGX += c.Segments * int64(s.unitCost(settings, c.Provider))
		}
	}
	for i := range points {
		points[i].ProfitUGX = points[i].RevenueUGX - points[i].SMSCostUGX
	}
	return points, nil
}

// ── Provider balances ──────────────────────────────────────────────────────

var numberPattern = regexp.MustCompile(`-?\d[\d,]*(\.\d+)?`)
var currencyPattern = regexp.MustCompile(`[A-Za-z]{3}`)

// parseBalance digs a numeric balance out of a gateway response, preferring keys named like "balance".
func parseBalance(raw interface{}) (float64, string, bool) {
	switch v := raw.(type) {
	case float64:
		return v, "", true
	case string:
		m := numberPattern.FindString(v)
		if m == "" {
			return 0, "", false
		}
		n, err := strconv.ParseFloat(strings.ReplaceAll(m, ",", ""), 64)
		return n, strings.ToUpper(currencyPattern.FindString(v)), err == nil
	case map[string]interface{}:
		currency := ""
		for k, val := range v {
			if strings.Contains(strings.ToLower(k), "currency") {
				if c, ok := val.(string); ok {
					currency = strings.ToUpper(c)
				}
			}
		}
		for _, want := range []string{"balance", "credit", "amount", "units", "data", "userdata"} {
			for k, val := range v {
				if strings.Contains(strings.ToLower(k), want) {
					if n, c, ok := parseBalance(val); ok {
						if c == "" {
							c = currency
						}
						return n, c, true
					}
				}
			}
		}
	case []interface{}:
		for _, item := range v {
			if n, c, ok := parseBalance(item); ok {
				return n, c, true
			}
		}
	}
	return 0, "", false
}

// ProviderBalances reads live balances from JulySMS and Africa's Talking.
func (s *AdminService) ProviderBalances() ([]models.ProviderBalance, error) {
	settings, err := s.Settings()
	if err != nil {
		return nil, err
	}
	cfg, _ := s.smsConfig.repo.Get()

	read := func(provider, label string, configured bool, threshold float64, check func() (*models.SMSBalanceResponse, error)) models.ProviderBalance {
		b := models.ProviderBalance{Provider: provider, Label: label, Configured: configured, Threshold: threshold, Currency: "UGX"}
		if !configured {
			return b
		}
		res, err := check()
		if err != nil {
			b.Error = err.Error()
			return b
		}
		b.Raw = res.Balance
		if n, c, ok := parseBalance(res.Balance); ok {
			b.Balance = &n
			if c != "" {
				b.Currency = c
			}
			b.Low = threshold > 0 && n < threshold
		} else {
			b.Error = "could not read the balance from the provider response"
		}
		return b
	}

	julyConfigured := cfg != nil && cfg.JulySMSClientID != "" && cfg.JulySMSClientSecret != ""
	atConfigured := cfg != nil && cfg.ATUsername != "" && cfg.ATAPIKey != ""
	return []models.ProviderBalance{
		read(models.SMSProviderJulySMS, "JulySMS", julyConfigured, settings.JulySMSThreshold, s.smsConfig.CheckJulySMSBalance),
		read(models.SMSProviderAfricasTalking, "Africa's Talking", atConfigured, settings.AfricasTalkingLimit, s.smsConfig.CheckAfricasTalkingBalance),
	}, nil
}

// ── Alerts ─────────────────────────────────────────────────────────────────

// alertTargets fills missing contacts from the admin who saved the settings (or the first admin).
func (s *AdminService) alertTargets(settings *models.AdminSettings) (emailTo, phone, whatsapp string, senderID uint) {
	emailTo, phone, whatsapp, senderID = settings.AlertEmail, settings.AlertPhone, settings.AlertWhatsApp, settings.WhatsAppSenderUserID
	var admin models.User
	query := s.db.Where("role = ?", "admin").Order("id asc")
	if senderID > 0 {
		query = s.db.Where("id = ?", senderID)
	}
	if err := query.First(&admin).Error; err == nil {
		senderID = admin.ID
		if emailTo == "" {
			emailTo = admin.Email
		}
		if phone == "" {
			phone = admin.Phone
		}
		if whatsapp == "" {
			whatsapp = phone
		}
	}
	return
}

// SendAlert delivers an alert on every enabled channel and reports what failed.
func (s *AdminService) SendAlert(subject, text string) []string {
	settings, err := s.Settings()
	if err != nil {
		return []string{err.Error()}
	}
	emailTo, phone, whatsapp, senderID := s.alertTargets(settings)
	var problems []string

	if settings.EmailEnabled {
		if emailTo == "" || s.email == nil {
			problems = append(problems, "email: no alert email set")
		} else if err := s.email.Send(emailTo, subject, "<p>"+strings.ReplaceAll(html.EscapeString(text), "\n", "<br>")+"</p>"); err != nil {
			problems = append(problems, "email: "+err.Error())
		}
	}
	if settings.SMSEnabled {
		if phone == "" {
			problems = append(problems, "sms: no alert phone set")
		} else if _, err := s.smsConfig.SendSMS(&models.SendSMSRequest{Phone: phone, Message: subject + ": " + text}); err != nil {
			problems = append(problems, "sms: "+err.Error())
		}
	}
	if settings.WhatsAppEnabled && s.whatsapp != nil {
		if whatsapp == "" {
			problems = append(problems, "whatsapp: no alert WhatsApp number set")
		} else if err := s.sendWhatsApp(senderID, whatsapp, "*"+subject+"*\n"+text); err != nil {
			problems = append(problems, "whatsapp: "+err.Error())
		}
	}
	for _, p := range problems {
		log.Printf("Admin alert %q: %s", subject, p)
	}
	return problems
}

func (s *AdminService) sendWhatsApp(senderID uint, to, text string) error {
	if senderID == 0 {
		return errors.New("no admin account to send from")
	}
	accounts, err := s.whatsapp.ListAccounts(senderID)
	if err != nil {
		return err
	}
	for _, account := range accounts {
		if account.Online {
			_, err := s.whatsapp.Send(senderID, &models.SendWhatsAppRequest{AccountID: account.ID, Phones: []string{to}, Message: text})
			return err
		}
	}
	return errors.New("the admin has no WhatsApp number online")
}

// NotifyTopup tells the admin about a completed user payment. It runs in the background.
func (s *AdminService) NotifyTopup(payment models.PaymentTransaction, user models.User) {
	go func() {
		settings, err := s.Settings()
		if err != nil || !settings.NotifyOnTopup {
			return
		}
		what := "SMS top-up"
		detail := fmt.Sprintf("%d SMS credits", payment.SMSCredits)
		switch payment.Purpose {
		case models.PaymentPurposePlan:
			what, detail = "Plan purchase", "plan subscription"
		case models.PaymentPurposeWhatsApp:
			what, detail = "WhatsApp credits", fmt.Sprintf("%d WhatsApp credits", payment.WhatsAppCredits)
		}
		text := fmt.Sprintf("%s (%s) paid UGX %s for %s via %s. Ref: %s",
			user.Name, user.Email, formatThousands(int64(payment.AmountUGX)), detail, strings.TrimSpace(payment.Provider+" "+payment.Method), payment.Reference)
		s.SendAlert("New "+what, text)
	}()
}

// StartBalanceMonitor checks provider balances periodically and alerts when one drops below its threshold.
func (s *AdminService) StartBalanceMonitor(every time.Duration) {
	go func() {
		time.Sleep(time.Minute)
		for {
			s.checkBalances()
			time.Sleep(every)
		}
	}()
}

func (s *AdminService) checkBalances() {
	settings, err := s.Settings()
	if err != nil || (settings.JulySMSThreshold <= 0 && settings.AfricasTalkingLimit <= 0) {
		return
	}
	balances, err := s.ProviderBalances()
	if err != nil {
		return
	}
	now := time.Now()
	changed := false
	for _, b := range balances {
		alertedAt := &settings.JulySMSAlertedAt
		if b.Provider == models.SMSProviderAfricasTalking {
			alertedAt = &settings.AfricasTalkingAlerted
		}
		if b.Balance == nil || b.Threshold <= 0 {
			continue
		}
		if !b.Low {
			if *alertedAt != nil {
				*alertedAt = nil
				changed = true
			}
			continue
		}
		if *alertedAt != nil && now.Sub(**alertedAt) < lowBalanceRepeat {
			continue
		}
		s.SendAlert(b.Label+" balance is low",
			fmt.Sprintf("%s balance is %s %.0f, below your alert level of %.0f. Recharge soon to keep SMS sending.", b.Label, b.Currency, *b.Balance, b.Threshold))
		t := now
		*alertedAt = &t
		changed = true
	}
	if changed {
		s.db.Model(settings).Select("julysms_alerted_at", "africastalking_alerted_at").Updates(settings)
	}
}

func formatThousands(n int64) string {
	s := strconv.FormatInt(n, 10)
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	var b strings.Builder
	for i, r := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(r)
	}
	if neg {
		return "-" + b.String()
	}
	return b.String()
}
