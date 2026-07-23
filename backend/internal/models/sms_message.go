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

// SMSMessageListItem is the API shape returned to clients for message history.
type SMSMessageListItem struct {
	ID           uint       `json:"id"`
	MessageID    string     `json:"message_id"`
	Phone        string     `json:"phone"`
	Message      string     `json:"message"`
	Segments     int        `json:"segments"`
	Credits      int        `json:"credits"`
	Status       string     `json:"status"`
	ErrorMessage string     `json:"error_message,omitempty"`
	SentAt       *time.Time `json:"sent_at,omitempty"`
	DeliveredAt  *time.Time `json:"delivered_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

func (m *SMSMessage) ToListItem() SMSMessageListItem {
	return SMSMessageListItem{
		ID:           m.ID,
		MessageID:    m.MessageID,
		Phone:        m.Phone,
		Message:      m.Message,
		Segments:     m.Segments,
		Credits:      m.Credits,
		Status:       m.Status,
		ErrorMessage: m.ErrorMessage,
		SentAt:       m.SentAt,
		DeliveredAt:  m.DeliveredAt,
		CreatedAt:    m.CreatedAt,
		UpdatedAt:    m.UpdatedAt,
	}
}

type SMSDashboardChartPoint struct {
	Date      string `json:"date"`
	Delivered int    `json:"delivered"`
	Failed    int    `json:"failed"`
}

type SMSDashboardHeatmapCell struct {
	Day   int `json:"day"`
	Level int `json:"level"`
	Count int `json:"count"`
}

type SMSDashboardStats struct {
	SuccessCount  int                       `json:"success_count"`
	QueuedCount   int                       `json:"queued_count"`
	TotalSent     int                       `json:"total_sent"`
	FailedCount   int                       `json:"failed_count"`
	DeliveryRate  float64                   `json:"delivery_rate"`
	Chart         []SMSDashboardChartPoint  `json:"chart"`
	Heatmap       []SMSDashboardHeatmapCell `json:"heatmap"`
	Recent        []SMSMessageListItem      `json:"recent"`
}
