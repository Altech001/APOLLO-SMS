package models

import (
	"time"

	"gorm.io/gorm"
)

// SMSProvider enumerates supported SMS gateway providers.
const (
	SMSProviderLocal          = "local"
	SMSProviderJulySMS        = "julysms"
	SMSProviderAfricasTalking = "africastalking"
)

// SMSConfig stores the platform-wide SMS gateway configuration.
// Only one row should exist — the admin upserts it.
type SMSConfig struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`

	// ── General ──
	ActiveProvider string `json:"active_provider" gorm:"not null;default:'local'"` // local | julysms | africastalking
	CostPerSegment int    `json:"cost_per_segment" gorm:"not null;default:31"`     // UGX charged per 160-char segment
	QueueBatchSize int    `json:"queue_batch_size" gorm:"not null;default:100"`    // max recipients per gateway call

	// ── JulySMS ──
	JulySMSClientID     string `json:"julysms_client_id"`
	JulySMSClientSecret string `json:"julysms_client_secret" gorm:"column:julysms_client_secret"`
	JulySMSSenderID     string `json:"julysms_sender_id"`

	// ── Africa's Talking ──
	ATUsername string `json:"at_username"`
	ATAPIKey   string `json:"at_api_key"`
	ATSenderID string `json:"at_sender_id"`
}

// SMSPricingRange defines how many UGX one SMS credit costs for a topup amount band.
type SMSPricingRange struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	MinAmount   int            `json:"min_amount" gorm:"not null;index"`
	MaxAmount   *int           `json:"max_amount" gorm:"index"`
	PricePerSMS int            `json:"price_per_sms" gorm:"not null"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// ── Request / Response DTOs ─────────────────────────────────────────────────

// SMSConfigRequest is the admin payload for saving SMS configuration.
type SMSConfigRequest struct {
	ActiveProvider string `json:"active_provider" validate:"required,oneof=local julysms africastalking"`
	CostPerSegment int    `json:"cost_per_segment" validate:"required,gt=0"`
	QueueBatchSize int    `json:"queue_batch_size" validate:"required,gt=0"`

	// JulySMS fields (required when provider is julysms)
	JulySMSClientID     string `json:"julysms_client_id"`
	JulySMSClientSecret string `json:"julysms_client_secret"`
	JulySMSSenderID     string `json:"julysms_sender_id"`

	// Africa's Talking fields (required when provider is africastalking)
	ATUsername string `json:"at_username"`
	ATAPIKey   string `json:"at_api_key"`
	ATSenderID string `json:"at_sender_id"`
}

// SMSConfigResponse is the API response for the current SMS config.
// Secrets are masked so they are never leaked over the wire.
type SMSConfigResponse struct {
	ID             uint      `json:"id"`
	ActiveProvider string    `json:"active_provider"`
	CostPerSegment int       `json:"cost_per_segment"`
	QueueBatchSize int       `json:"queue_batch_size"`
	UpdatedAt      time.Time `json:"updated_at"`

	// JulySMS (secrets masked)
	JulySMSClientID     string `json:"julysms_client_id"`
	JulySMSClientSecret string `json:"julysms_client_secret"`
	JulySMSSenderID     string `json:"julysms_sender_id"`

	// Africa's Talking (secrets masked)
	ATUsername string `json:"at_username"`
	ATAPIKey   string `json:"at_api_key"`
	ATSenderID string `json:"at_sender_id"`
}

// SMSPricingRangeRequest is the admin payload for one SMS pricing band.
type SMSPricingRangeRequest struct {
	MinAmount   int  `json:"min_amount"`
	MaxAmount   *int `json:"max_amount"`
	PricePerSMS int  `json:"price_per_sms"`
}

// SMSPricingRangeResponse is returned to admins and topup calculators.
type SMSPricingRangeResponse struct {
	ID          uint `json:"id"`
	MinAmount   int  `json:"min_amount"`
	MaxAmount   *int `json:"max_amount"`
	PricePerSMS int  `json:"price_per_sms"`
}

func (r *SMSPricingRange) ToResponse() SMSPricingRangeResponse {
	return SMSPricingRangeResponse{
		ID:          r.ID,
		MinAmount:   r.MinAmount,
		MaxAmount:   r.MaxAmount,
		PricePerSMS: r.PricePerSMS,
	}
}

type SMSUsageSummary struct {
	DepositCount       int64 `json:"deposit_count"`
	CompletedDeposits  int64 `json:"completed_deposits"`
	FailedDeposits     int64 `json:"failed_deposits"`
	ProcessingDeposits int64 `json:"processing_deposits"`
	TotalDepositUGX    int64 `json:"total_deposit_ugx"`
	SMSPurchased       int64 `json:"sms_purchased"`
	SMSAvailable       int64 `json:"sms_available"`
	SMSUsed            int64 `json:"sms_used"`
	SMSPending         int64 `json:"sms_pending"`
	SMSFailed          int64 `json:"sms_failed"`
}

// maskSecret returns a masked version of a secret string (shows last 4 chars).
func maskSecret(s string) string {
	if len(s) <= 4 {
		return "****"
	}
	return "****" + s[len(s)-4:]
}

// ToResponse converts the database model to a safe API response with masked secrets.
func (c *SMSConfig) ToResponse() SMSConfigResponse {
	return SMSConfigResponse{
		ID:             c.ID,
		ActiveProvider: c.ActiveProvider,
		CostPerSegment: c.CostPerSegment,
		QueueBatchSize: c.QueueBatchSize,
		UpdatedAt:      c.UpdatedAt,

		JulySMSClientID:     c.JulySMSClientID,
		JulySMSClientSecret: maskSecret(c.JulySMSClientSecret),
		JulySMSSenderID:     c.JulySMSSenderID,

		ATUsername: c.ATUsername,
		ATAPIKey:   maskSecret(c.ATAPIKey),
		ATSenderID: c.ATSenderID,
	}
}

// ── SMS Sending DTOs ────────────────────────────────────────────────────────

// SendSMSRequest is the payload for sending an SMS through the configured provider.
type SendSMSRequest struct {
	Phone   string   `json:"phone"`
	Phones  []string `json:"phones"`
	Message string   `json:"message" validate:"required"`
}

// SendSMSResponse is the response after dispatching an SMS.
type SendSMSResponse struct {
	Provider    string      `json:"provider"`
	Recipients  int         `json:"recipients"`
	Message     string      `json:"message"`
	RawResponse interface{} `json:"raw_response,omitempty"`
}

// SMSBalanceResponse holds the gateway balance info.
type SMSBalanceResponse struct {
	Provider string      `json:"provider"`
	Balance  interface{} `json:"balance"`
}

// ── JulySMS Webhook ─────────────────────────────────────────────────────────

// JulySMSDeliveryStatus represents the webhook payload from JulySMS.
type JulySMSDeliveryStatus struct {
	MessageID   string `json:"message_id"`
	Phone       string `json:"phone"`
	Status      string `json:"status"` // delivered | failed
	SentAt      string `json:"sent_at"`
	DeliveredAt string `json:"delivered_at"`
}

// SMSDeliveryLog stores delivery status updates received from provider webhooks.
type SMSDeliveryLog struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Provider    string         `json:"provider" gorm:"not null;index"`
	MessageID   string         `json:"message_id" gorm:"not null;index"`
	Phone       string         `json:"phone" gorm:"not null"`
	Status      string         `json:"status" gorm:"not null"` // delivered | failed
	SentAt      string         `json:"sent_at"`
	DeliveredAt string         `json:"delivered_at"`
	RawPayload  string         `json:"raw_payload" gorm:"type:text"`
	CreatedAt   time.Time      `json:"created_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}
