package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"backend/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrWhatsAppPaymentRequired is returned when a user has no free allowance or credits left for WhatsApp.
var ErrWhatsAppPaymentRequired = errors.New("payment required")

// ErrPaidPlanRequired is returned when a free-plan user calls a paid-only feature.
var ErrPaidPlanRequired = errors.New("this feature is available on paid plans. Upgrade your plan to use it")

// minCollectionUGX is the smallest amount MarzPay accepts for a collection.
const minCollectionUGX = 500

// defaultBillingPlans are created on startup when missing. Admins can edit them afterwards.
func defaultBillingPlans() []models.BillingPlan {
	return []models.BillingPlan{
		{
			Code: models.PlanCodeFree, Name: "Free", SortOrder: 0, IsActive: true,
			Description:       "Try LucoSMS with a daily free allowance.",
			DailyFreeSMS:      5,
			DailyFreeWhatsApp: 10,
			WhatsAppPriceUGX:  10,
			Features:          "5 free SMS every day\n10 free WhatsApp messages every day\nStandard SMS pricing\nBuy WhatsApp credits any time",
		},
		{
			Code: models.PlanCodeWeekly, Name: "Weekly", SortOrder: 1, IsActive: true,
			Description:       "Short campaigns and bulk WhatsApp for a week.",
			PriceUGX:          5000,
			DurationDays:      7,
			SMSPriceUGX:       30,
			WhatsAppCredits:   300,
			DailyFreeSMS:      5,
			DailyFreeWhatsApp: 10,
			WhatsAppPerSMS:    1,
			WhatsAppPriceUGX:  8,
			Features:          "SMS at 30 UGX\n300 WhatsApp messages included\nBulk WhatsApp, queued safely\n1 bonus WhatsApp message per SMS bought",
		},
		{
			Code: models.PlanCodeMonthly, Name: "Monthly", SortOrder: 2, IsActive: true, IsPopular: true,
			Description:       "Steady messaging for growing businesses.",
			PriceUGX:          15000,
			DurationDays:      30,
			SMSPriceUGX:       30,
			WhatsAppCredits:   1500,
			DailyFreeSMS:      5,
			DailyFreeWhatsApp: 10,
			WhatsAppPerSMS:    1,
			WhatsAppPriceUGX:  7,
			Features:          "SMS at 30 UGX\n1,500 WhatsApp messages included\nBulk WhatsApp, queued safely\n1 bonus WhatsApp message per SMS bought",
		},
		{
			Code: models.PlanCodeYearly, Name: "Yearly", SortOrder: 3, IsActive: true,
			Description:       "Best rates for high-volume senders.",
			PriceUGX:          150000,
			DurationDays:      365,
			SMSPriceUGX:       29,
			WhatsAppCredits:   20000,
			DailyFreeSMS:      5,
			DailyFreeWhatsApp: 10,
			WhatsAppPerSMS:    2,
			WhatsAppPriceUGX:  5,
			Features:          "SMS at 29 UGX\n20,000 WhatsApp messages included\nBulk WhatsApp, queued safely\n2 bonus WhatsApp messages per SMS bought",
		},
	}
}

// BillingService owns plans, subscriptions, daily free allowances and WhatsApp credits.
// SMS and WhatsApp charging runs inside the caller's transaction with the user row locked,
// so concurrent sends cannot spend the same credit twice.
type BillingService struct {
	db           *gorm.DB
	notifService *NotificationService
	smsConfig    *SMSConfigService
}

// NewBillingService creates a BillingService and makes sure the default plans exist.
func NewBillingService(db *gorm.DB, notifService *NotificationService, smsConfig *SMSConfigService) *BillingService {
	s := &BillingService{db: db, notifService: notifService, smsConfig: smsConfig}
	if err := s.ensureDefaultPlans(); err != nil {
		fmt.Printf("⚠️  Failed to seed billing plans: %v\n", err)
	}
	return s
}

func (s *BillingService) ensureDefaultPlans() error {
	for _, plan := range defaultBillingPlans() {
		var count int64
		if err := s.db.Unscoped().Model(&models.BillingPlan{}).Where("code = ?", plan.Code).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			if err := s.db.Create(&plan).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func today() string {
	return time.Now().Format("2006-01-02")
}

// ── Plans ──────────────────────────────────────────────────────────────────

// ListPlans returns plans ordered for display. Inactive plans are only included for admins.
func (s *BillingService) ListPlans(includeInactive bool) ([]models.BillingPlan, error) {
	var plans []models.BillingPlan
	query := s.db.Order("sort_order asc, id asc")
	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}
	err := query.Find(&plans).Error
	return plans, err
}

// GetPlan returns an active plan by ID.
func (s *BillingService) GetPlan(id uint) (*models.BillingPlan, error) {
	var plan models.BillingPlan
	if err := s.db.Where("id = ? AND is_active = ?", id, true).First(&plan).Error; err != nil {
		return nil, errors.New("plan not found")
	}
	return &plan, nil
}

func validatePlanRequest(req *models.BillingPlanRequest) error {
	req.Code = strings.ToLower(strings.TrimSpace(req.Code))
	req.Name = strings.TrimSpace(req.Name)
	if req.Code == "" || req.Name == "" {
		return errors.New("code and name are required")
	}
	for _, v := range []int{req.PriceUGX, req.DurationDays, req.SMSPriceUGX, req.WhatsAppCredits, req.DailyFreeSMS, req.DailyFreeWhatsApp, req.WhatsAppPerSMS, req.WhatsAppPriceUGX} {
		if v < 0 {
			return errors.New("plan values cannot be negative")
		}
	}
	if req.Code == models.PlanCodeFree {
		if req.PriceUGX != 0 || req.DurationDays != 0 {
			return errors.New("the free plan must have price 0 and duration 0")
		}
		if !req.IsActive {
			return errors.New("the free plan cannot be deactivated")
		}
	} else {
		if req.PriceUGX < minCollectionUGX {
			return fmt.Errorf("paid plans must cost at least %d UGX", minCollectionUGX)
		}
		if req.DurationDays <= 0 {
			return errors.New("paid plans need a duration in days")
		}
	}
	return nil
}

func applyPlanRequest(plan *models.BillingPlan, req *models.BillingPlanRequest) {
	plan.Code = req.Code
	plan.Name = req.Name
	plan.Description = req.Description
	plan.PriceUGX = req.PriceUGX
	plan.DurationDays = req.DurationDays
	plan.SMSPriceUGX = req.SMSPriceUGX
	plan.WhatsAppCredits = req.WhatsAppCredits
	plan.DailyFreeSMS = req.DailyFreeSMS
	plan.DailyFreeWhatsApp = req.DailyFreeWhatsApp
	plan.WhatsAppPerSMS = req.WhatsAppPerSMS
	plan.WhatsAppPriceUGX = req.WhatsAppPriceUGX
	plan.Features = req.Features
	plan.IsPopular = req.IsPopular
	plan.IsActive = req.IsActive
	plan.SortOrder = req.SortOrder
}

// CreatePlan adds a new plan (admin).
func (s *BillingService) CreatePlan(req *models.BillingPlanRequest) (*models.BillingPlan, error) {
	if err := validatePlanRequest(req); err != nil {
		return nil, err
	}
	var count int64
	s.db.Unscoped().Model(&models.BillingPlan{}).Where("code = ?", req.Code).Count(&count)
	if count > 0 {
		return nil, errors.New("a plan with this code already exists")
	}
	plan := &models.BillingPlan{}
	applyPlanRequest(plan, req)
	if err := s.db.Create(plan).Error; err != nil {
		return nil, err
	}
	return plan, nil
}

// UpdatePlan edits a plan (admin). Existing subscriptions keep their expiry; new prices apply to new purchases.
func (s *BillingService) UpdatePlan(id uint, req *models.BillingPlanRequest) (*models.BillingPlan, error) {
	if err := validatePlanRequest(req); err != nil {
		return nil, err
	}
	var plan models.BillingPlan
	if err := s.db.First(&plan, id).Error; err != nil {
		return nil, errors.New("plan not found")
	}
	if plan.Code == models.PlanCodeFree && req.Code != models.PlanCodeFree {
		return nil, errors.New("the free plan code cannot be changed")
	}
	if req.Code != plan.Code {
		var count int64
		s.db.Unscoped().Model(&models.BillingPlan{}).Where("code = ? AND id <> ?", req.Code, id).Count(&count)
		if count > 0 {
			return nil, errors.New("a plan with this code already exists")
		}
	}
	applyPlanRequest(&plan, req)
	// Save writes zero values too (e.g. is_popular=false), which Updates(struct) would skip.
	if err := s.db.Save(&plan).Error; err != nil {
		return nil, err
	}
	return &plan, nil
}

// ── Active plan & allowances ───────────────────────────────────────────────

func (s *BillingService) freePlan(tx *gorm.DB) models.BillingPlan {
	var plan models.BillingPlan
	if err := tx.Where("code = ?", models.PlanCodeFree).First(&plan).Error; err == nil {
		return plan
	}
	return defaultBillingPlans()[0]
}

// activePlan returns the user's current plan and subscription (nil subscription means the free plan).
func (s *BillingService) activePlan(tx *gorm.DB, userID uint) (models.BillingPlan, *models.UserSubscription) {
	var subs []models.UserSubscription
	tx.Where("user_id = ? AND status = ? AND (expires_at IS NULL OR expires_at > ?)", userID, models.SubscriptionActive, time.Now()).
		Order("id desc").Limit(1).Find(&subs)
	if len(subs) > 0 {
		var plan models.BillingPlan
		// Unscoped: a plan deleted after purchase still honours the subscription.
		if err := tx.Unscoped().First(&plan, subs[0].PlanID).Error; err == nil {
			return plan, &subs[0]
		}
	}
	return s.freePlan(tx), nil
}

// HasPaidFeatures reports whether a user may use paid-only features (AI images, WhatsApp templates).
// Admins always can.
func (s *BillingService) HasPaidFeatures(userID uint) bool {
	var user models.User
	if err := s.db.Select("id", "role").First(&user, userID).Error; err == nil && user.Role == "admin" {
		return true
	}
	plan, sub := s.activePlan(s.db, userID)
	return sub != nil && plan.Code != models.PlanCodeFree
}

// lockDailyUsage returns today's usage row for a user, creating it if needed, locked for update.
func (s *BillingService) lockDailyUsage(tx *gorm.DB, userID uint) (*models.DailyUsage, error) {
	day := today()
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&models.DailyUsage{UserID: userID, Day: day}).Error; err != nil {
		return nil, err
	}
	var usage models.DailyUsage
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND day = ?", userID, day).First(&usage).Error
	return &usage, err
}

// ConsumeSMS applies the daily free SMS allowance to a send of `units` segments and deducts the rest
// from user.SMSBalance in memory. The caller must hold a row lock on the user and save it.
func (s *BillingService) ConsumeSMS(tx *gorm.DB, user *models.User, units int) (free, paid int, err error) {
	plan, _ := s.activePlan(tx, user.ID)
	usage, err := s.lockDailyUsage(tx, user.ID)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to check daily allowance: %w", err)
	}

	free = min(max(0, plan.DailyFreeSMS-usage.FreeSMSUsed), units)
	paid = units - free
	if user.SMSBalance < paid {
		return 0, 0, fmt.Errorf("insufficient SMS balance. Required: %d credits (%d covered by today's free SMS), Available: %d credits", paid, free, user.SMSBalance)
	}

	if free > 0 {
		if err := tx.Model(usage).Update("free_sms_used", gorm.Expr("free_sms_used + ?", free)).Error; err != nil {
			return 0, 0, err
		}
	}
	user.SMSBalance -= paid
	return free, paid, nil
}

// ConsumeWhatsApp charges `count` WhatsApp messages: today's free allowance first, then credits.
// It locks the user row itself. It is all-or-nothing and returns ErrWhatsAppPaymentRequired when short.
func (s *BillingService) ConsumeWhatsApp(tx *gorm.DB, userID uint, count int) (free, paid, balance int, err error) {
	var user models.User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
		return 0, 0, 0, errors.New("user not found")
	}
	plan, _ := s.activePlan(tx, userID)
	usage, err := s.lockDailyUsage(tx, userID)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("failed to check daily allowance: %w", err)
	}

	free = min(max(0, plan.DailyFreeWhatsApp-usage.FreeWhatsAppUsed), count)
	paid = count - free
	if user.WhatsAppBalance < paid {
		return 0, 0, user.WhatsAppBalance, fmt.Errorf("%w: this send needs %d WhatsApp credits (after %d free today) but you have %d. Buy WhatsApp credits or upgrade your plan",
			ErrWhatsAppPaymentRequired, paid, free, user.WhatsAppBalance)
	}

	if free > 0 {
		if err := tx.Model(usage).Update("free_whatsapp_used", gorm.Expr("free_whatsapp_used + ?", free)).Error; err != nil {
			return 0, 0, 0, err
		}
	}
	if paid > 0 {
		if err := tx.Model(&user).Update("whatsapp_balance", gorm.Expr("whatsapp_balance - ?", paid)).Error; err != nil {
			return 0, 0, 0, err
		}
	}
	return free, paid, user.WhatsAppBalance - paid, nil
}

// RefundWhatsAppTx returns the charge of messages that were never sent to where it came from.
func (s *BillingService) RefundWhatsAppTx(tx *gorm.DB, messages []models.WhatsAppMessage) error {
	credits := map[uint]int{}
	free := map[uint]map[string]int{}
	for _, msg := range messages {
		switch msg.ChargedFrom {
		case models.ChargeSourceCredit:
			credits[msg.UserID]++
		case models.ChargeSourceFree:
			day := msg.CreatedAt.Format("2006-01-02")
			if free[msg.UserID] == nil {
				free[msg.UserID] = map[string]int{}
			}
			free[msg.UserID][day]++
		}
	}
	for userID, n := range credits {
		if err := tx.Model(&models.User{}).Where("id = ?", userID).
			Update("whatsapp_balance", gorm.Expr("whatsapp_balance + ?", n)).Error; err != nil {
			return err
		}
	}
	for userID, days := range free {
		for day, n := range days {
			if err := tx.Model(&models.DailyUsage{}).Where("user_id = ? AND day = ?", userID, day).
				Update("free_whatsapp_used", gorm.Expr("GREATEST(free_whatsapp_used - ?, 0)", n)).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// ── Summary & pricing ──────────────────────────────────────────────────────

// Summary returns the user's plan, balances and remaining free allowance for today.
func (s *BillingService) Summary(userID uint) (*models.BillingSummary, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, errors.New("user not found")
	}
	plan, sub := s.activePlan(s.db, userID)

	var usage models.DailyUsage
	s.db.Where("user_id = ? AND day = ?", userID, today()).Limit(1).Find(&usage)

	smsPrice := plan.SMSPriceUGX
	if smsPrice <= 0 && s.smsConfig != nil {
		if price, err := s.smsConfig.PriceForAmountUGX(minCollectionUGX); err == nil {
			smsPrice = price
		}
	}

	summary := &models.BillingSummary{
		Plan:                  plan,
		SMSBalance:            user.SMSBalance,
		WhatsAppBalance:       user.WhatsAppBalance,
		FreeSMSRemaining:      max(0, plan.DailyFreeSMS-usage.FreeSMSUsed),
		FreeWhatsAppRemaining: max(0, plan.DailyFreeWhatsApp-usage.FreeWhatsAppUsed),
		SMSPriceUGX:           smsPrice,
		WhatsAppPriceUGX:      plan.WhatsAppPriceUGX,
	}
	paid := s.HasPaidFeatures(userID)
	summary.Features = models.BillingFeatures{AIImages: paid, WhatsAppTemplates: paid}
	if plan.WhatsAppPriceUGX > 0 {
		summary.MinWhatsAppCreditOrder = (minCollectionUGX + plan.WhatsAppPriceUGX - 1) / plan.WhatsAppPriceUGX
	}
	if sub != nil {
		summary.SubscriptionID = &sub.ID
		summary.SubscriptionExpiresAt = sub.ExpiresAt
	}
	return summary, nil
}

// SMSPriceForUser returns the price per SMS credit for a purchase and the WhatsApp bonus per SMS.
func (s *BillingService) SMSPriceForUser(userID uint, amountUGX int) (pricePerSMS, whatsAppPerSMS int, err error) {
	plan, _ := s.activePlan(s.db, userID)
	if plan.SMSPriceUGX > 0 {
		if amountUGX < minCollectionUGX {
			return 0, 0, fmt.Errorf("amount_ugx must be at least %d", minCollectionUGX)
		}
		return plan.SMSPriceUGX, plan.WhatsAppPerSMS, nil
	}
	price, err := s.smsConfig.PriceForAmountUGX(amountUGX)
	return price, plan.WhatsAppPerSMS, err
}

// WhatsAppCreditPrice returns the price per WhatsApp credit on the user's current plan.
func (s *BillingService) WhatsAppCreditPrice(userID uint) (int, error) {
	plan, _ := s.activePlan(s.db, userID)
	if plan.WhatsAppPriceUGX <= 0 {
		return 0, errors.New("WhatsApp credits are not for sale on your plan")
	}
	return plan.WhatsAppPriceUGX, nil
}

// ── Subscriptions ──────────────────────────────────────────────────────────

// ActivatePlanTx activates a paid plan for a user inside the payment transaction. Buying the plan
// that is already active extends it; buying a different plan replaces the current one.
// The caller must hold a row lock on the user; plan WhatsApp credits are added to user in memory.
func (s *BillingService) ActivatePlanTx(tx *gorm.DB, user *models.User, planID uint, reference string, amountUGX int) (*models.BillingPlan, error) {
	var plan models.BillingPlan
	if err := tx.Unscoped().First(&plan, planID).Error; err != nil {
		return nil, fmt.Errorf("plan %d not found", planID)
	}

	now := time.Now()
	start := now
	current, currentSub := s.activePlan(tx, user.ID)
	if currentSub != nil {
		if current.ID == plan.ID && currentSub.ExpiresAt != nil && currentSub.ExpiresAt.After(now) {
			start = *currentSub.ExpiresAt
		}
		if err := tx.Model(&models.UserSubscription{}).
			Where("user_id = ? AND status = ?", user.ID, models.SubscriptionActive).
			Update("status", models.SubscriptionReplaced).Error; err != nil {
			return nil, err
		}
	}

	expires := start.Add(time.Duration(plan.DurationDays) * 24 * time.Hour)
	sub := &models.UserSubscription{
		UserID:           user.ID,
		PlanID:           plan.ID,
		PlanCode:         plan.Code,
		Status:           models.SubscriptionActive,
		PriceUGX:         amountUGX,
		StartsAt:         now,
		ExpiresAt:        &expires,
		PaymentReference: reference,
	}
	if err := tx.Create(sub).Error; err != nil {
		return nil, err
	}

	user.WhatsAppBalance += plan.WhatsAppCredits
	return &plan, nil
}

// SwitchToFree cancels the user's paid subscription and returns them to the free plan.
func (s *BillingService) SwitchToFree(userID uint) (*models.BillingSummary, error) {
	err := s.db.Model(&models.UserSubscription{}).
		Where("user_id = ? AND status = ?", userID, models.SubscriptionActive).
		Update("status", models.SubscriptionCancelled).Error
	if err != nil {
		return nil, err
	}
	s.notifService.Notify(userID, "Plan Changed", "You are now on the Free plan.", "info")
	return s.Summary(userID)
}
