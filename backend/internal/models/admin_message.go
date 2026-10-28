package models

import "time"

// AdminMessageHistoryQuery filters the platform-wide sent-message audit list.
type AdminMessageHistoryQuery struct {
	Page    int
	PerPage int
	Channel string
	Status  string
	Search  string
	UserID  uint
}

// AdminMessageHistoryItem is one SMS or WhatsApp record with its owning account.
type AdminMessageHistoryItem struct {
	ID                uint       `json:"id"`
	Channel           string     `json:"channel"`
	UserID            uint       `json:"user_id"`
	UserName          string     `json:"user_name"`
	UserEmail         string     `json:"user_email"`
	UserAccountStatus string     `json:"user_account_status"`
	Recipient         string     `json:"recipient"`
	Message           string     `json:"message"`
	Status            string     `json:"status"`
	Provider          string     `json:"provider"`
	Source            string     `json:"source"`
	Segments          int        `json:"segments"`
	Credits           int        `json:"credits"`
	Error             string     `json:"error,omitempty"`
	SentAt            *time.Time `json:"sent_at,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
}

// AdminMessageHistoryResponse contains a page of platform-wide message history.
type AdminMessageHistoryResponse struct {
	Items      []AdminMessageHistoryItem `json:"items"`
	Total      int64                     `json:"total"`
	Page       int                       `json:"page"`
	PerPage    int                       `json:"per_page"`
	TotalPages int                       `json:"total_pages"`
}
