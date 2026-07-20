package models

import (
	"time"

	"gorm.io/gorm"
)

// SMSTemplate represents a reusable SMS template defined by a user.
type SMSTemplate struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	UserID    uint           `json:"user_id" gorm:"index;not null"`
	Name      string         `json:"name" gorm:"not null"`
	Category  string         `json:"category" gorm:"not null"` // e.g. "Authentication", "Alerts", "Marketing"
	Body      string         `json:"body" gorm:"not null"`     // e.g. "Your verification code is {code}"
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// CreateSMSTemplateRequest is the input payload for creating a template.
type CreateSMSTemplateRequest struct {
	Name     string `json:"name" validate:"required,min=2"`
	Category string `json:"category" validate:"required"`
	Body     string `json:"body" validate:"required,min=1"`
}

// UpdateSMSTemplateRequest is the input payload for updating a template.
type UpdateSMSTemplateRequest struct {
	Name     string `json:"name" validate:"required,min=2"`
	Category string `json:"category" validate:"required"`
	Body     string `json:"body" validate:"required,min=1"`
}

// SMSTemplateResponse represents the output structure for HTTP responses.
type SMSTemplateResponse struct {
	ID        uint      `json:"id"`
	UserID    uint      `json:"user_id"`
	Name      string    `json:"name"`
	Category  string    `json:"category"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ToResponse formats an SMSTemplate database record to SMSTemplateResponse.
func (t *SMSTemplate) ToResponse() SMSTemplateResponse {
	return SMSTemplateResponse{
		ID:        t.ID,
		UserID:    t.UserID,
		Name:      t.Name,
		Category:  t.Category,
		Body:      t.Body,
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
	}
}
