package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// SMSTemplate represents a reusable SMS template defined by a user.
type SMSTemplate struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	UserID    uint           `json:"user_id" gorm:"index;not null"`
	Name      string         `json:"name" gorm:"not null"`
	Category  string         `json:"category" gorm:"not null"`              // e.g. "Authentication", "Alerts", "Marketing"
	Channel   string         `json:"channel" gorm:"not null;default:'sms'"` // sms or whatsapp
	Body      string         `json:"body" gorm:"not null"`                  // e.g. "Your verification code is {code}"
	Extras    string         `json:"-" gorm:"type:text"`                    // WhatsAppRich JSON for WhatsApp templates
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// CreateSMSTemplateRequest is the input payload for creating a template.
type CreateSMSTemplateRequest struct {
	Name     string        `json:"name" validate:"required,min=2"`
	Category string        `json:"category" validate:"required"`
	Channel  string        `json:"channel"`
	Body     string        `json:"body" validate:"required,min=1"`
	Extras   *WhatsAppRich `json:"extras,omitempty"`
}

// UpdateSMSTemplateRequest is the input payload for updating a template.
type UpdateSMSTemplateRequest struct {
	Name     string        `json:"name" validate:"required,min=2"`
	Category string        `json:"category" validate:"required"`
	Channel  string        `json:"channel"`
	Body     string        `json:"body" validate:"required,min=1"`
	Extras   *WhatsAppRich `json:"extras,omitempty"`
}

// SMSTemplateResponse represents the output structure for HTTP responses.
type SMSTemplateResponse struct {
	ID        uint          `json:"id"`
	UserID    uint          `json:"user_id"`
	Name      string        `json:"name"`
	Category  string        `json:"category"`
	Channel   string        `json:"channel"`
	Body      string        `json:"body"`
	Extras    *WhatsAppRich `json:"extras,omitempty"`
	CreatedAt time.Time     `json:"created_at"`
	UpdatedAt time.Time     `json:"updated_at"`
}

// ToResponse formats an SMSTemplate database record to SMSTemplateResponse.
func (t *SMSTemplate) ToResponse() SMSTemplateResponse {
	return SMSTemplateResponse{
		ID:        t.ID,
		UserID:    t.UserID,
		Name:      t.Name,
		Category:  t.Category,
		Channel:   t.Channel,
		Body:      t.Body,
		Extras:    t.RichExtras(),
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
	}
}

func (t *SMSTemplate) RichExtras() *WhatsAppRich {
	if t.Extras == "" {
		return nil
	}
	var rich WhatsAppRich
	if json.Unmarshal([]byte(t.Extras), &rich) != nil {
		return nil
	}
	return &rich
}

func (t *SMSTemplate) SetRichExtras(rich *WhatsAppRich) {
	if rich == nil || (rich.ImageURL == "" && rich.Header == "" && rich.Footer == "" && len(rich.Buttons) == 0) {
		t.Extras = ""
		return
	}
	b, _ := json.Marshal(rich)
	t.Extras = string(b)
}
