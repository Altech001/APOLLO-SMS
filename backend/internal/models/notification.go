package models

import (
	"time"

	"gorm.io/gorm"
)

// Notification represents an activity log / notification for a user.
type Notification struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	UserID    uint           `json:"user_id" gorm:"index;not null"`
	Title     string         `json:"title" gorm:"not null"`
	Message   string         `json:"message" gorm:"not null"`
	Type      string         `json:"type" gorm:"not null"` // e.g. "info", "warning", "success", "error"
	IsRead    bool           `json:"is_read" gorm:"default:false"`
	CreatedAt time.Time      `json:"created_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// NotificationResponse formats a notification for HTTP responses.
type NotificationResponse struct {
	ID        uint      `json:"id"`
	UserID    uint      `json:"user_id"`
	Title     string    `json:"title"`
	Message   string    `json:"message"`
	Type      string    `json:"type"`
	IsRead    bool      `json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}

// ToResponse converts a Notification to NotificationResponse.
func (n *Notification) ToResponse() NotificationResponse {
	return NotificationResponse{
		ID:        n.ID,
		UserID:    n.UserID,
		Title:     n.Title,
		Message:   n.Message,
		Type:      n.Type,
		IsRead:    n.IsRead,
		CreatedAt: n.CreatedAt,
	}
}
