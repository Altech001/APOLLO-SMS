package models

import (
	"time"

	"gorm.io/gorm"
)

// UserSession represents an active login session.
type UserSession struct {
	ID             uint           `json:"id" gorm:"primaryKey"`
	UserID         uint           `json:"user_id" gorm:"index;not null"`
	User           User           `json:"-" gorm:"foreignKey:UserID"`
	TokenID        string         `json:"-" gorm:"uniqueIndex;not null"` // Unique identifier for the JWT session
	IPAddress      string         `json:"ip_address"`
	UserAgent      string         `json:"user_agent"`
	Device         string         `json:"device"`
	Location       string         `json:"location"`
	ISP            string         `json:"isp"`
	ConnectionTy   string         `json:"connection_type"`
	CountryFlag    string         `json:"country_flag"`
	IsActive       bool           `json:"is_active" gorm:"default:true;index"`
	ExpiresAt      time.Time      `json:"expires_at"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `json:"-" gorm:"index"`
}

// UserSecurityLog records key security events for a user.
type UserSecurityLog struct {
	ID           uint           `json:"id" gorm:"primaryKey"`
	UserID       uint           `json:"user_id" gorm:"index;not null"`
	User         User           `json:"-" gorm:"foreignKey:UserID"`
	Action       string         `json:"action" gorm:"not null"` // e.g., "Register", "Login", "Password Reset", "Email Verified"
	IPAddress    string         `json:"ip_address"`
	UserAgent    string         `json:"user_agent"`
	Device       string         `json:"device"`
	Location     string         `json:"location"`
	ISP          string         `json:"isp"`
	ConnectionTy string         `json:"connection_type"`
	CountryFlag  string         `json:"country_flag"`
	CreatedAt    time.Time      `json:"created_at"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
}

// SessionResponse is the simplified JSON structure returned to the client.
type SessionResponse struct {
	ID           uint      `json:"id"`
	IPAddress    string    `json:"ip_address"`
	Device       string    `json:"device"`
	Location     string    `json:"location"`
	ISP          string    `json:"isp"`
	ConnectionTy string    `json:"connection_type"`
	CountryFlag  string    `json:"country_flag"`
	IsCurrent    bool      `json:"is_current"`
	CreatedAt    time.Time `json:"created_at"`
	ExpiresAt    time.Time `json:"expires_at"`
}

// SecurityLogResponse is the simplified security log response.
type SecurityLogResponse struct {
	ID           uint      `json:"id"`
	Action       string    `json:"action"`
	IPAddress    string    `json:"ip_address"`
	Device       string    `json:"device"`
	Location     string    `json:"location"`
	ISP          string    `json:"isp"`
	ConnectionTy string    `json:"connection_type"`
	CountryFlag  string    `json:"country_flag"`
	CreatedAt    time.Time `json:"created_at"`
}
