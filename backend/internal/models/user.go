package models

import (
	"time"

	"gorm.io/gorm"
)

// User represents a user account in the system.
type User struct {
	ID                          uint           `json:"id" gorm:"primaryKey"`
	Name                        string         `json:"name" gorm:"not null"`
	Email                       string         `json:"email" gorm:"uniqueIndex;not null"`
	Phone                       string         `json:"phone" gorm:"column:phone;index"` // E.164 (+256...), used for SMS verification and reset codes
	Password                    string         `json:"-" gorm:"not null"`               // Hidden in JSON responses
	Role                        string         `json:"role" gorm:"not null;default:'user'"`
	SMSBalance                  int            `json:"sms_balance" gorm:"not null;default:20"`
	WhatsAppBalance             int            `json:"whatsapp_balance" gorm:"column:whatsapp_balance;not null;default:30"`
	ProfileImage                string         `json:"profile_image"`
	IsVerified                  bool           `json:"is_verified" gorm:"default:false"`
	VerificationToken           string         `json:"-" gorm:"index"`
	VerificationExpiresAt       *time.Time     `json:"-"`
	PasswordResetToken          string         `json:"-" gorm:"index"`
	PasswordResetTokenExpiresAt *time.Time     `json:"-"`
	CreatedAt                   time.Time      `json:"created_at"`
	UpdatedAt                   time.Time      `json:"updated_at"`
	DeletedAt                   gorm.DeletedAt `json:"-" gorm:"index"`
}

// RegisterRequest is the payload for registering a new user.
type RegisterRequest struct {
	Name     string `json:"name" validate:"required,min=2"`
	Email    string `json:"email" validate:"required,email"`
	Phone    string `json:"phone"`
	Password string `json:"password" validate:"required,min=6"`
}

// CreateUserRequest is the payload for creating a user (Admin CRUD).
type CreateUserRequest struct {
	Name       string `json:"name" validate:"required,min=2"`
	Email      string `json:"email" validate:"required,email"`
	Password   string `json:"password" validate:"required,min=6"`
	Role       string `json:"role" validate:"required,oneof=admin user"`
	SMSBalance int    `json:"sms_balance"`
}

// UpdateUserRequest is the payload for updating a user (Admin CRUD).
type UpdateUserRequest struct {
	Name       string `json:"name" validate:"required,min=2"`
	Email      string `json:"email" validate:"required,email"`
	Password   string `json:"password"` // optional in update
	Role       string `json:"role" validate:"required,oneof=admin user"`
	SMSBalance int    `json:"sms_balance"`
}

// LoginRequest is the payload for logging in.
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// Password reset / verification delivery channels.
const (
	AuthChannelEmail = "email"
	AuthChannelSMS   = "sms"
)

// ForgotPasswordRequest is the payload for requesting a password reset link (email) or code (sms).
type ForgotPasswordRequest struct {
	Email   string `json:"email" validate:"required,email"`
	Channel string `json:"channel"` // "email" (default) or "sms"
}

// ForgotPasswordResponse tells the client where the reset was sent.
type ForgotPasswordResponse struct {
	Message     string `json:"message"`
	Channel     string `json:"channel"`
	MaskedPhone string `json:"masked_phone,omitempty"`
	ChargedUGX  int    `json:"charged_ugx,omitempty"`
}

// ResetPasswordSMSRequest resets a password with the code sent by SMS.
type ResetPasswordSMSRequest struct {
	Email       string `json:"email" validate:"required,email"`
	Code        string `json:"code" validate:"required"`
	NewPassword string `json:"new_password" validate:"required,min=6"`
}

// VerificationTicketRequest carries the short-lived ticket issued when an unverified user signs up
// or enters the right password. It proves who is asking without creating a login session.
type VerificationTicketRequest struct {
	Ticket string `json:"ticket" validate:"required"`
}

// VerifySMSCodeRequest confirms an account with the code sent to the registered phone.
type VerifySMSCodeRequest struct {
	Ticket string `json:"ticket" validate:"required"`
	Code   string `json:"code" validate:"required"`
}

// VerificationRequiredResponse is returned (with 403) when an unverified user logs in, and on signup.
type VerificationRequiredResponse struct {
	Email       string `json:"email"`
	Ticket      string `json:"ticket"`
	HasPhone    bool   `json:"has_phone"`
	MaskedPhone string `json:"masked_phone,omitempty"`
	SMSFeeUGX   int    `json:"sms_fee_ugx"`
}

// SMSCodeSentResponse confirms a code was sent and what it cost.
type SMSCodeSentResponse struct {
	Message     string `json:"message"`
	MaskedPhone string `json:"masked_phone"`
	ChargedUGX  int    `json:"charged_ugx"`
	ExpiresIn   int    `json:"expires_in"` // seconds
}

// ResetPasswordRequest is the payload for resetting the password.
type ResetPasswordRequest struct {
	Token       string `json:"token" validate:"required"`
	NewPassword string `json:"new_password" validate:"required,min=6"`
}

// ResendVerificationRequest is the payload for resending verification email.
type ResendVerificationRequest struct {
	Email string `json:"email" validate:"required,email"`
}

// ChangePasswordRequest is the payload for an authenticated user changing their own password.
type ChangePasswordRequest struct {
	CurrentPassword    string `json:"current_password" validate:"required"`
	NewPassword        string `json:"new_password" validate:"required,min=6"`
	ConfirmNewPassword string `json:"confirm_new_password" validate:"required,min=6"`
}

// UserResponse is the standardized response structure for a user.
type UserResponse struct {
	ID              uint      `json:"id"`
	Name            string    `json:"name"`
	Email           string    `json:"email"`
	Phone           string    `json:"phone"`
	Role            string    `json:"role"`
	SMSBalance      int       `json:"sms_balance"`
	WhatsAppBalance int       `json:"whatsapp_balance"`
	ProfileImage    string    `json:"profile_image"`
	IsVerified      bool      `json:"is_verified"`
	CreatedAt       time.Time `json:"created_at"`
}

// CreditRecipientResponse exposes only the fields needed to select a transfer recipient.
type CreditRecipientResponse struct {
	ID           uint   `json:"id"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	ProfileImage string `json:"profile_image"`
}

// ToResponse formats a User model into UserResponse.
func (u *User) ToResponse() UserResponse {
	return UserResponse{
		ID:              u.ID,
		Name:            u.Name,
		Email:           u.Email,
		Phone:           u.Phone,
		Role:            u.Role,
		SMSBalance:      u.SMSBalance,
		WhatsAppBalance: u.WhatsAppBalance,
		ProfileImage:    u.ProfileImage,
		IsVerified:      u.IsVerified,
		CreatedAt:       u.CreatedAt,
	}
}

// ToCreditRecipientResponse formats a User for non-admin recipient lookup.
func (u *User) ToCreditRecipientResponse() CreditRecipientResponse {
	return CreditRecipientResponse{
		ID:           u.ID,
		Name:         u.Name,
		Email:        u.Email,
		ProfileImage: u.ProfileImage,
	}
}

// RegisterResponse is the created user plus what the client needs to open the verify screen.
type RegisterResponse struct {
	UserResponse
	Verification VerificationRequiredResponse `json:"verification"`
}

// LoginResponse contains user info and JWT access token.
type LoginResponse struct {
	User  UserResponse `json:"user"`
	Token string       `json:"token"`
}
