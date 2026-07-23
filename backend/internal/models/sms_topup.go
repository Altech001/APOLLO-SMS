package models

import (
	"time"

	"gorm.io/gorm"
)

// SMSTopup represents an SMS credit top-up transaction.
type SMSTopup struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	UserID      uint           `json:"user_id" gorm:"index;not null"`
	Amount      int            `json:"amount" gorm:"not null"`
	AmountUGX   int            `json:"amount_ugx" gorm:"not null;default:0"`
	PricePerSMS int            `json:"price_per_sms" gorm:"not null;default:0"`
	Description string         `json:"description" gorm:"not null"`
	Reference   string         `json:"reference"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
}

// SMSTopupRequest is the payload for adding SMS credits to a user or transferring credits between users.
type SMSTopupRequest struct {
	Amount      int    `json:"amount"` // Backward-compatible alias for amount_ugx.
	AmountUGX   int    `json:"amount_ugx"`
	Description string `json:"description" validate:"required"`
	Reference   string `json:"reference"`
	RecipientID uint   `json:"recipient_id,omitempty"`
}

// SMSTopupResponse formats a topup transaction for HTTP responses.
type SMSTopupResponse struct {
	ID          uint      `json:"id"`
	UserID      uint      `json:"user_id"`
	Amount      int       `json:"amount"`
	AmountUGX   int       `json:"amount_ugx"`
	PricePerSMS int       `json:"price_per_sms"`
	Description string    `json:"description"`
	Reference   string    `json:"reference"`
	CreatedAt   time.Time `json:"created_at"`
}

// ToResponse converts SMSTopup database model to SMSTopupResponse.
func (t *SMSTopup) ToResponse() SMSTopupResponse {
	return SMSTopupResponse{
		ID:          t.ID,
		UserID:      t.UserID,
		Amount:      t.Amount,
		AmountUGX:   t.AmountUGX,
		PricePerSMS: t.PricePerSMS,
		Description: t.Description,
		Reference:   t.Reference,
		CreatedAt:   t.CreatedAt,
	}
}
