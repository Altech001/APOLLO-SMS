package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// AIConversation is one chat with the AI assistant. Messages is the chat as the app renders it,
// stored as JSON text; the server only checks it is a JSON array.
type AIConversation struct {
	ID        uint           `json:"id" gorm:"column:id;primaryKey"`
	UserID    uint           `json:"user_id" gorm:"column:user_id;not null;index"`
	Title     string         `json:"title" gorm:"column:title;not null;default:''"`
	Messages  string         `json:"-" gorm:"column:messages;type:text;not null;default:'[]'"`
	CreatedAt time.Time      `json:"created_at" gorm:"column:created_at"`
	UpdatedAt time.Time      `json:"updated_at" gorm:"column:updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"column:deleted_at;index"`
}

// TableName pins the table created by migration 006.
func (AIConversation) TableName() string { return "ai_conversations" }

// AIConversationSummary is a row in the history list.
type AIConversationSummary struct {
	ID        uint      `json:"id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// AIConversationResponse is a full conversation.
type AIConversationResponse struct {
	ID        uint            `json:"id"`
	Title     string          `json:"title"`
	Messages  json.RawMessage `json:"messages"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// SaveAIConversationRequest creates or updates a conversation. An empty title keeps the current one,
// and a conversation without a title gets one generated from its first exchange.
type SaveAIConversationRequest struct {
	Title    string          `json:"title"`
	Messages json.RawMessage `json:"messages"`
}
