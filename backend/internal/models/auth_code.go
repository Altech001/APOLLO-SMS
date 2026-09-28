package models

import "time"

// Purposes an auth code or auth SMS can serve.
const (
	AuthPurposeVerify = "verify"
	AuthPurposeReset  = "reset"
)

// Auth SMS charge statuses.
const (
	AuthChargeCharged  = "charged"
	AuthChargeRefunded = "refunded"
)

// AuthCode is a one-time numeric code sent by SMS. Only a hash of the code is stored.
type AuthCode struct {
	ID         uint       `json:"id" gorm:"primaryKey"`
	UserID     uint       `json:"user_id" gorm:"column:user_id;index;not null"`
	Purpose    string     `json:"purpose" gorm:"column:purpose;type:varchar(16);not null"`
	CodeHash   string     `json:"-" gorm:"column:code_hash;not null"`
	Phone      string     `json:"phone" gorm:"column:phone;not null"`
	Attempts   int        `json:"attempts" gorm:"column:attempts;not null;default:0"`
	ExpiresAt  time.Time  `json:"expires_at" gorm:"column:expires_at;not null"`
	ConsumedAt *time.Time `json:"consumed_at" gorm:"column:consumed_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

// AuthSMSCharge records every verification / reset SMS billed to a user's account.
type AuthSMSCharge struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"column:user_id;index;not null"`
	Purpose   string    `json:"purpose" gorm:"column:purpose;type:varchar(16);not null"`
	Phone     string    `json:"phone" gorm:"column:phone;not null"`
	Provider  string    `json:"provider" gorm:"column:provider"`
	Credits   int       `json:"credits" gorm:"column:credits;not null;default:0"`
	AmountUGX int       `json:"amount_ugx" gorm:"column:amount_ugx;not null;default:0"`
	Status    string    `json:"status" gorm:"column:status;type:varchar(16);not null"`
	Error     string    `json:"error" gorm:"column:error"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName pins the table name so GORM doesn't split the SMS acronym.
func (AuthSMSCharge) TableName() string { return "auth_sms_charges" }
