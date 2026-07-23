package models

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

// FlexInt unmarshals MarzPay amount fields that may be JSON numbers or strings.
type FlexInt int

func (f *FlexInt) UnmarshalJSON(data []byte) error {
	if len(data) == 0 || string(data) == "null" {
		return nil
	}
	var n int
	if err := json.Unmarshal(data, &n); err == nil {
		*f = FlexInt(n)
		return nil
	}
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return err
	}
	*f = FlexInt(v)
	return nil
}

func (f FlexInt) Int() int {
	return int(f)
}

const (
	PaymentTypeCollection   = "collection"
	PaymentTypeDisbursement = "disbursement"
	PaymentTypeSMSDebit     = "sms_debit"

	PaymentStatusPending    = "pending"
	PaymentStatusProcessing = "processing"
	PaymentStatusCompleted  = "completed"
	PaymentStatusFailed     = "failed"
)

type PaymentTransaction struct {
	ID                    uint           `json:"id" gorm:"primaryKey"`
	UserID                *uint          `json:"user_id" gorm:"index"`
	User                  User           `json:"-" gorm:"foreignKey:UserID"`
	Type                  string         `json:"type" gorm:"not null;index"`
	Status                string         `json:"status" gorm:"not null;default:'pending';index"`
	AmountUGX             int            `json:"amount_ugx" gorm:"not null"`
	SMSCredits            int            `json:"sms_credits" gorm:"not null;default:0"`
	PricePerSMS           int            `json:"price_per_sms" gorm:"not null;default:0"`
	PhoneNumber           string         `json:"phone_number"`
	Country               string         `json:"country" gorm:"not null;default:'UG'"`
	Method                string         `json:"method"`
	Provider              string         `json:"provider"`
	ProviderTransactionID string         `json:"provider_transaction_id"`
	Reference             string         `json:"reference" gorm:"uniqueIndex;not null"`
	TransactionUUID       string         `json:"transaction_uuid"`
	Description           string         `json:"description"`
	RawPayload            string         `json:"raw_payload" gorm:"type:text"`
	CompletedAt           *time.Time     `json:"completed_at"`
	CreatedAt             time.Time      `json:"created_at"`
	UpdatedAt             time.Time      `json:"updated_at"`
	DeletedAt             gorm.DeletedAt `json:"-" gorm:"index"`
}

type CreateCollectionRequest struct {
	AmountUGX   int    `json:"amount_ugx"`
	PhoneNumber string `json:"phone_number"`
	Method      string `json:"method"`
	Description string `json:"description"`
}

type CreateCollectionResponse struct {
	Reference   string                 `json:"reference"`
	Status      string                 `json:"status"`
	AmountUGX   int                    `json:"amount_ugx"`
	SMSCredits  int                    `json:"sms_credits"`
	PricePerSMS int                    `json:"price_per_sms"`
	RawResponse map[string]interface{} `json:"raw_response,omitempty"`
}

type CreateWithdrawalRequest struct {
	AmountUGX   int    `json:"amount_ugx"`
	PhoneNumber string `json:"phone_number"`
	Description string `json:"description"`
}

type PaymentTransactionResponse struct {
	ID                    uint       `json:"id"`
	UserID                *uint      `json:"user_id"`
	Type                  string     `json:"type"`
	Status                string     `json:"status"`
	AmountUGX             int        `json:"amount_ugx"`
	SMSCredits            int        `json:"sms_credits"`
	PricePerSMS           int        `json:"price_per_sms"`
	PhoneNumber           string     `json:"phone_number"`
	Country               string     `json:"country"`
	Method                string     `json:"method"`
	Provider              string     `json:"provider"`
	ProviderTransactionID string     `json:"provider_transaction_id"`
	Reference             string     `json:"reference"`
	TransactionUUID       string     `json:"transaction_uuid"`
	Description           string     `json:"description"`
	CompletedAt           *time.Time `json:"completed_at"`
	CreatedAt             time.Time  `json:"created_at"`
}

func (p *PaymentTransaction) ToResponse() PaymentTransactionResponse {
	return PaymentTransactionResponse{
		ID:                    p.ID,
		UserID:                p.UserID,
		Type:                  p.Type,
		Status:                p.Status,
		AmountUGX:             p.AmountUGX,
		SMSCredits:            p.SMSCredits,
		PricePerSMS:           p.PricePerSMS,
		PhoneNumber:           p.PhoneNumber,
		Country:               p.Country,
		Method:                p.Method,
		Provider:              p.Provider,
		ProviderTransactionID: p.ProviderTransactionID,
		Reference:             p.Reference,
		TransactionUUID:       p.TransactionUUID,
		Description:           p.Description,
		CompletedAt:           p.CompletedAt,
		CreatedAt:             p.CreatedAt,
	}
}

type MarzPayWebhookPayload struct {
	EventType   string `json:"event_type"`
	Transaction struct {
		UUID        string `json:"uuid"`
		Reference   string `json:"reference"`
		Status      string `json:"status"`
		Provider    string `json:"provider"`
		PhoneNumber string `json:"phone_number"`
		Description string `json:"description"`
		Amount      struct {
			Raw      FlexInt `json:"raw"`
			Currency string  `json:"currency"`
		} `json:"amount"`
	} `json:"transaction"`
	Collection struct {
		Provider              string `json:"provider"`
		PhoneNumber           string `json:"phone_number"`
		Mode                  string `json:"mode"`
		ProviderTransactionID string `json:"provider_transaction_id"`
		Amount                struct {
			Raw      FlexInt `json:"raw"`
			Currency string  `json:"currency"`
		} `json:"amount"`
	} `json:"collection"`
}
