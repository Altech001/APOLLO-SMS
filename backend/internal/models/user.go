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
	Password                    string         `json:"-" gorm:"not null"` // Hidden in JSON responses
	Role                        string         `json:"role" gorm:"not null;default:'user'"`
	SMSBalance                  int            `json:"sms_balance" gorm:"not null;default:20"`
	ProfileImage                string         `json:"profile_image"`
	IsVerified                  bool           `json:"is_verified" gorm:"default:false"`
	VerificationToken           string         `json:"-" gorm:"index"`
	VerificationExpiresAt      *time.Time     `json:"-"`
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

// ForgotPasswordRequest is the payload for requesting password reset link.
type ForgotPasswordRequest struct {
	Email string `json:"email" validate:"required,email"`
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
	ID           uint      `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	Role         string    `json:"role"`
	SMSBalance   int       `json:"sms_balance"`
	ProfileImage string    `json:"profile_image"`
	IsVerified   bool      `json:"is_verified"`
	CreatedAt    time.Time `json:"created_at"`
}

// ToResponse formats a User model into UserResponse.
func (u *User) ToResponse() UserResponse {
	return UserResponse{
		ID:           u.ID,
		Name:         u.Name,
		Email:        u.Email,
		Role:         u.Role,
		SMSBalance:   u.SMSBalance,
		ProfileImage: u.ProfileImage,
		IsVerified:   u.IsVerified,
		CreatedAt:    u.CreatedAt,
	}
}

// LoginResponse contains user info and JWT access token.
type LoginResponse struct {
	User  UserResponse `json:"user"`
	Token string       `json:"token"`
}
