package models

import "time"

// AdminSettings is the single-row platform settings for profit reporting and admin alerts.
type AdminSettings struct {
	ID                    uint       `json:"id" gorm:"primaryKey"`
	JulySMSCostUGX        int        `json:"julysms_cost_ugx" gorm:"column:julysms_cost_ugx;not null;default:20"`
	AfricasTalkingCost    int        `json:"africastalking_cost_ugx" gorm:"column:africastalking_cost_ugx;not null;default:27"`
	OtherProviderCostUGX  int        `json:"other_cost_ugx" gorm:"column:other_cost_ugx;not null;default:0"`
	AlertEmail            string     `json:"alert_email"`
	AlertPhone            string     `json:"alert_phone"`
	AlertWhatsApp         string     `json:"alert_whatsapp" gorm:"column:alert_whatsapp"`
	EmailEnabled          bool       `json:"email_enabled" gorm:"not null;default:true"`
	SMSEnabled            bool       `json:"sms_enabled" gorm:"column:sms_enabled;not null;default:true"`
	WhatsAppEnabled       bool       `json:"whatsapp_enabled" gorm:"column:whatsapp_enabled;not null;default:true"`
	NotifyOnTopup         bool       `json:"notify_on_topup" gorm:"not null;default:true"`
	JulySMSThreshold      float64    `json:"julysms_threshold" gorm:"column:julysms_threshold;not null;default:0"`
	AfricasTalkingLimit   float64    `json:"africastalking_threshold" gorm:"column:africastalking_threshold;not null;default:0"`
	WhatsAppSenderUserID  uint       `json:"whatsapp_sender_user_id" gorm:"column:whatsapp_sender_user_id;not null;default:0"`
	JulySMSAlertedAt      *time.Time `json:"-" gorm:"column:julysms_alerted_at"`
	AfricasTalkingAlerted *time.Time `json:"-" gorm:"column:africastalking_alerted_at"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
}

// TableName keeps the table name readable.
func (AdminSettings) TableName() string { return "admin_settings" }

// AdminSettingsRequest is the editable part of AdminSettings.
type AdminSettingsRequest struct {
	JulySMSCostUGX       int     `json:"julysms_cost_ugx"`
	AfricasTalkingCost   int     `json:"africastalking_cost_ugx"`
	OtherProviderCostUGX int     `json:"other_cost_ugx"`
	AlertEmail           string  `json:"alert_email"`
	AlertPhone           string  `json:"alert_phone"`
	AlertWhatsApp        string  `json:"alert_whatsapp"`
	EmailEnabled         bool    `json:"email_enabled"`
	SMSEnabled           bool    `json:"sms_enabled"`
	WhatsAppEnabled      bool    `json:"whatsapp_enabled"`
	NotifyOnTopup        bool    `json:"notify_on_topup"`
	JulySMSThreshold     float64 `json:"julysms_threshold"`
	AfricasTalkingLimit  float64 `json:"africastalking_threshold"`
}

// ProviderBalance is a live balance reading from an SMS gateway.
type ProviderBalance struct {
	Provider   string      `json:"provider"`
	Label      string      `json:"label"`
	Configured bool        `json:"configured"`
	Balance    *float64    `json:"balance"`
	Currency   string      `json:"currency"`
	Threshold  float64     `json:"threshold"`
	Low        bool        `json:"low"`
	Error      string      `json:"error,omitempty"`
	Raw        interface{} `json:"raw,omitempty"`
}

// ProviderUsage is SMS traffic and cost for one provider and source.
type ProviderUsage struct {
	Provider   string `json:"provider"`
	Source     string `json:"source"` // app or api
	Messages   int64  `json:"messages"`
	Segments   int64  `json:"segments"`
	CostUGX    int64  `json:"cost_ugx"`
	UnitCost   int    `json:"unit_cost_ugx"`
	RevenueUGX int64  `json:"revenue_ugx"`
}

// ProfitDay is one point in the revenue chart.
type ProfitDay struct {
	Day        string `json:"day"`
	RevenueUGX int64  `json:"revenue_ugx"`
	SMSCostUGX int64  `json:"sms_cost_ugx"`
	ProfitUGX  int64  `json:"profit_ugx"`
}

// ProfitSummary is the admin revenue and profit report for a period.
type ProfitSummary struct {
	From               *time.Time      `json:"from"`
	To                 time.Time       `json:"to"`
	SMSRevenueUGX      int64           `json:"sms_revenue_ugx"`
	PlanRevenueUGX     int64           `json:"plan_revenue_ugx"`
	WhatsAppRevenueUGX int64           `json:"whatsapp_revenue_ugx"`
	TotalRevenueUGX    int64           `json:"total_revenue_ugx"`
	SMSCostUGX         int64           `json:"sms_cost_ugx"`
	SMSProfitUGX       int64           `json:"sms_profit_ugx"`
	TotalProfitUGX     int64           `json:"total_profit_ugx"`
	AvgSellPriceUGX    float64         `json:"avg_sell_price_ugx"`
	AppSegments        int64           `json:"app_segments"`
	APISegments        int64           `json:"api_segments"`
	AppRevenueUGX      int64           `json:"app_revenue_ugx"`
	APIRevenueUGX      int64           `json:"api_revenue_ugx"`
	AppCostUGX         int64           `json:"app_cost_ugx"`
	APICostUGX         int64           `json:"api_cost_ugx"`
	Topups             int64           `json:"topups"`
	PayingUsers        int64           `json:"paying_users"`
	WhatsAppSent       int64           `json:"whatsapp_sent"`
	Providers          []ProviderUsage `json:"providers"`
	Daily              []ProfitDay     `json:"daily"`
}
