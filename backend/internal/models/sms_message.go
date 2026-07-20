package models

import (
	"time"

	"gorm.io/gorm"
)

const (
	SMSMessageStatusQueued     = "queued"
	SMSMessageStatusProcessing = "processing"
	SMSMessageStatusSent       = "sent"
	SMSMessageStatusDelivered  = "delivered"
	SMSMessageStatusFailed     = "failed"
)

// SMSMessage stores the auditable message record for each recipient.
type SMSMessage struct {
	ID                   uint           `json:"id" gorm:"primaryKey"`
	CustomerID           *uint          `json:"customer_id,omitempty" gorm:"column:customer_id;index"`
	UserID               uint           `json:"user_id" gorm:"index;not null"`
	User                 User           `json:"-" gorm:"foreignKey:UserID"`
	SMSJobID             *uint          `json:"sms_job_id" gorm:"uniqueIndex"`
	PaymentTransactionID *uint          `json:"payment_transaction_id" gorm:"index"`
	Provider             string         `json:"provider" gorm:"index"`
	MessageID            string         `json:"message_id" gorm:"uniqueIndex;not null"`
	Phone                string         `json:"phone" gorm:"not null"`
	Message              string         `json:"message" gorm:"type:text;not null"`
	Segments             int            `json:"segments" gorm:"not null;default:1"`
	Credits              int            `json:"credits" gorm:"not null;default:1"`
	Status               string         `json:"status" gorm:"not null;default:'queued';index"`
	ErrorMessage         string         `json:"error_message"`
	SentAt               *time.Time     `json:"sent_at"`
	DeliveredAt          *time.Time     `json:"delivered_at"`
	RawResponse          string         `json:"raw_response" gorm:"type:text"`
	CreatedAt            time.Time      `json:"created_at" gorm:"index"`
	UpdatedAt            time.Time      `json:"updated_at"`
	DeletedAt            gorm.DeletedAt `json:"-" gorm:"index"`
}
