package models

import (
	"time"

	"gorm.io/gorm"
)

// Billing plan codes. The free plan is the fallback whenever a user has no active paid subscription.
const (
	PlanCodeFree    = "free"
	PlanCodeWeekly  = "weekly"
	PlanCodeMonthly = "monthly"
	PlanCodeYearly  = "yearly"
)

// Subscription statuses.
const (
	SubscriptionActive    = "active"
	SubscriptionReplaced  = "replaced"
	SubscriptionCancelled = "cancelled"
)

// Payment purposes carried on a MarzPay collection.
const (
	PaymentPurposeSMS      = "sms"
	PaymentPurposePlan     = "plan"
	PaymentPurposeWhatsApp = "whatsapp"
)

// Sources a WhatsApp message credit can be charged from, used for refunds.
const (
	ChargeSourceFree   = "free"
	ChargeSourceCredit = "credit"
)

// BillingPlan is an admin-editable subscription plan.
type BillingPlan struct {
	ID                uint           `json:"id" gorm:"primaryKey"`
	Code              string         `json:"code" gorm:"uniqueIndex;not null"`
	Name              string         `json:"name" gorm:"not null"`
	Description       string         `json:"description"`
	PriceUGX          int            `json:"price_ugx" gorm:"column:price_ugx;not null;default:0"`
	DurationDays      int            `json:"duration_days" gorm:"not null;default:0"`                                  // 0 = never expires (free)
	SMSPriceUGX       int            `json:"sms_price_ugx" gorm:"column:sms_price_ugx;not null;default:0"`             // price per SMS credit when buying; 0 = standard pricing ranges
	WhatsAppCredits   int            `json:"whatsapp_credits" gorm:"column:whatsapp_credits;not null;default:0"`       // granted when the plan is activated
	DailyFreeSMS      int            `json:"daily_free_sms" gorm:"column:daily_free_sms;not null;default:0"`           // free SMS units per day
	DailyFreeWhatsApp int            `json:"daily_free_whatsapp" gorm:"column:daily_free_whatsapp;not null;default:0"` // free WhatsApp messages per day
	WhatsAppPerSMS    int            `json:"whatsapp_per_sms" gorm:"column:whatsapp_per_sms;not null;default:0"`       // bonus WhatsApp credits per SMS credit bought
	WhatsAppPriceUGX  int            `json:"whatsapp_price_ugx" gorm:"column:whatsapp_price_ugx;not null;default:0"`   // price per extra WhatsApp credit
	Features          string         `json:"features" gorm:"type:text"`                                                // newline-separated feature list for plan cards
	IsPopular         bool           `json:"is_popular" gorm:"not null;default:false"`
	IsActive          bool           `json:"is_active" gorm:"not null;default:true"`
	SortOrder         int            `json:"sort_order" gorm:"not null;default:0"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
	DeletedAt         gorm.DeletedAt `json:"-" gorm:"index"`
}

// UserSubscription records a user's paid plan period.
type UserSubscription struct {
	ID               uint       `json:"id" gorm:"primaryKey"`
	UserID           uint       `json:"user_id" gorm:"index;not null"`
	PlanID           uint       `json:"plan_id" gorm:"not null"`
	PlanCode         string     `json:"plan_code" gorm:"not null"`
	Status           string     `json:"status" gorm:"index;not null"`
	PriceUGX         int        `json:"price_ugx" gorm:"column:price_ugx;not null;default:0"`
	StartsAt         time.Time  `json:"starts_at" gorm:"not null"`
	ExpiresAt        *time.Time `json:"expires_at" gorm:"index"`
	PaymentReference string     `json:"payment_reference" gorm:"index"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// DailyUsage tracks how much of the daily free allowance a user has consumed.
type DailyUsage struct {
	ID               uint      `json:"id" gorm:"primaryKey"`
	UserID           uint      `json:"user_id" gorm:"uniqueIndex:idx_daily_usage_user_day;not null"`
	Day              string    `json:"day" gorm:"uniqueIndex:idx_daily_usage_user_day;type:varchar(10);not null"` // YYYY-MM-DD, server local time
	FreeSMSUsed      int       `json:"free_sms_used" gorm:"column:free_sms_used;not null;default:0"`
	FreeWhatsAppUsed int       `json:"free_whatsapp_used" gorm:"column:free_whatsapp_used;not null;default:0"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// TableName keeps the table name readable.
func (DailyUsage) TableName() string { return "daily_usage" }

// BillingPlanRequest is the admin payload for creating or updating a plan.
type BillingPlanRequest struct {
	Code              string `json:"code"`
	Name              string `json:"name"`
	Description       string `json:"description"`
	PriceUGX          int    `json:"price_ugx"`
	DurationDays      int    `json:"duration_days"`
	SMSPriceUGX       int    `json:"sms_price_ugx"`
	WhatsAppCredits   int    `json:"whatsapp_credits"`
	DailyFreeSMS      int    `json:"daily_free_sms"`
	DailyFreeWhatsApp int    `json:"daily_free_whatsapp"`
	WhatsAppPerSMS    int    `json:"whatsapp_per_sms"`
	WhatsAppPriceUGX  int    `json:"whatsapp_price_ugx"`
	Features          string `json:"features"`
	IsPopular         bool   `json:"is_popular"`
	IsActive          bool   `json:"is_active"`
	SortOrder         int    `json:"sort_order"`
}

// SubscribeRequest starts a plan purchase (or switches to a free plan).
type SubscribeRequest struct {
	PlanID      uint   `json:"plan_id"`
	PhoneNumber string `json:"phone_number"`
	Method      string `json:"method"`
}

// BuyWhatsAppCreditsRequest starts a WhatsApp credit purchase.
type BuyWhatsAppCreditsRequest struct {
	Credits     int    `json:"credits"`
	PhoneNumber string `json:"phone_number"`
	Method      string `json:"method"`
}

// SubscribeResponse is returned by a plan purchase. Paid plans return a collection to poll.
type SubscribeResponse struct {
	Activated  bool                      `json:"activated"`
	Collection *CreateCollectionResponse `json:"collection,omitempty"`
	Summary    *BillingSummary           `json:"summary,omitempty"`
}

// BillingSummary is everything the UI needs to show a user's plan and balances.
type BillingSummary struct {
	Plan                   BillingPlan `json:"plan"`
	SubscriptionID         *uint       `json:"subscription_id"`
	SubscriptionExpiresAt  *time.Time  `json:"subscription_expires_at"`
	SMSBalance             int         `json:"sms_balance"`
	WhatsAppBalance        int         `json:"whatsapp_balance"`
	FreeSMSRemaining       int         `json:"free_sms_remaining"`
	FreeWhatsAppRemaining  int         `json:"free_whatsapp_remaining"`
	SMSPriceUGX            int         `json:"sms_price_ugx"`
	WhatsAppPriceUGX       int         `json:"whatsapp_price_ugx"`
	MinWhatsAppCreditOrder int         `json:"min_whatsapp_credit_order"`
}
