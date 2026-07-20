package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"backend/internal/config"
	"backend/internal/models"
	"backend/internal/repository"
	"backend/pkg/email"
	"backend/pkg/ipgeo"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// AuthService handles authentication, registration, password resets and verification logic.
type AuthService struct {
	userRepo     *repository.UserRepository
	securityRepo *repository.SecurityRepository
	emailSender  *email.EmailSender
	ipgeoClient  *ipgeo.Client
	cfg          *config.Config
	notifService *NotificationService
	redisService *RedisService
}

// NewAuthService creates a new AuthService instance.
func NewAuthService(
	userRepo *repository.UserRepository,
	securityRepo *repository.SecurityRepository,
	emailSender *email.EmailSender,
	ipgeoClient *ipgeo.Client,
	cfg *config.Config,
	notifService *NotificationService,
	redisService *RedisService,
) *AuthService {
	return &AuthService{
		userRepo:     userRepo,
		securityRepo: securityRepo,
		emailSender:  emailSender,
		ipgeoClient:  ipgeoClient,
		cfg:          cfg,
		notifService: notifService,
		redisService: redisService,
	}
}

// Register registers a new user, hashes password, generates verification token, and sends email.
func (s *AuthService) Register(req *models.RegisterRequest, ipAddress, userAgent string) (*models.User, error) {
	// Check if email already taken
	existing, _ := s.userRepo.FindByEmail(req.Email)
	if existing != nil {
		return nil, errors.New("Email address already taken")
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// Generate verification token
	token, err := s.generateSecureToken()
	if err != nil {
		return nil, err
	}

	expiresAt := time.Now().Add(24 * time.Hour) // Token valid for 24 hours

	user := &models.User{
		Name:                  req.Name,
		Email:                 req.Email,
		Password:              string(hashedPassword),
		IsVerified:            false,
		VerificationToken:     token,
		VerificationExpiresAt: &expiresAt,
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, fmt.Errorf("failed to save user: %w", err)
	}

	// Log security event
	go func() {
		details, _ := s.ipgeoClient.GetDetails(ipAddress)
		logEntry := &models.UserSecurityLog{
			UserID:    user.ID,
			Action:    "Register",
			IPAddress: ipAddress,
			UserAgent: userAgent,
			Device:    ipgeo.ParseUserAgent(userAgent),
		}
		if details != nil {
			logEntry.Location = fmt.Sprintf("%s, %s, %s %s", details.City, details.StateProv, details.CountryName, details.CountryEmoji)
			logEntry.ISP = details.ISP
			logEntry.ConnectionTy = details.ConnectionTy
			logEntry.CountryFlag = details.CountryFlag
		}
		_ = s.securityRepo.CreateSecurityLog(logEntry)
	}()

	// Send verification email
	verifyURL := fmt.Sprintf("http://localhost:%s/api/v1/auth/verify-email?token=%s", s.cfg.Port, token)
	emailBody, err := email.GetVerificationTemplate(user.Name, verifyURL)
	if err != nil {
		return nil, fmt.Errorf("failed to render verification email: %w", err)
	}

	// Send asynchronously to avoid blocking the request
	go func() {
		_ = s.emailSender.Send(user.Email, "Verify Your Email Address", emailBody)
	}()

	s.notifService.Notify(user.ID, "Account Created", "Welcome to Luco SMS! Please verify your email address.", "info")
	s.cacheUserIndex(user)

	return user, nil
}

// VerifyEmail verifies user's email via the verification token.
func (s *AuthService) VerifyEmail(token string, ipAddress, userAgent string) error {
	user, err := s.userRepo.FindByVerificationToken(token)
	if err != nil {
		return errors.New("Invalid or expired verification token")
	}

	if user.IsVerified {
		return nil // Already verified
	}

	if user.VerificationExpiresAt == nil || time.Now().After(*user.VerificationExpiresAt) {
		return errors.New("Verification token expired")
	}

	// Update user status
	user.IsVerified = true
	user.VerificationToken = ""
	user.VerificationExpiresAt = nil

	if err := s.userRepo.Update(user); err != nil {
		return fmt.Errorf("Failed to update user verification status: %w", err)
	}
	s.cacheUserIndex(user)

	// Log security event
	go func() {
		details, _ := s.ipgeoClient.GetDetails(ipAddress)
		logEntry := &models.UserSecurityLog{
			UserID:    user.ID,
			Action:    "Email Verified",
			IPAddress: ipAddress,
			UserAgent: userAgent,
			Device:    ipgeo.ParseUserAgent(userAgent),
		}
		if details != nil {
			logEntry.Location = fmt.Sprintf("%s, %s, %s %s", details.City, details.StateProv, details.CountryName, details.CountryEmoji)
			logEntry.ISP = details.ISP
			logEntry.ConnectionTy = details.ConnectionTy
			logEntry.CountryFlag = details.CountryFlag
		}
		_ = s.securityRepo.CreateSecurityLog(logEntry)
	}()

	s.notifService.Notify(user.ID, "Email Verified", "Your email address has been successfully verified.", "success")

	return nil
}

// Login validates user credentials, creates a database session, and returns a JWT.
func (s *AuthService) Login(req *models.LoginRequest, ipAddress, userAgent string) (*models.User, string, error) {
	user, err := s.userRepo.FindByEmail(req.Email)
	if err != nil {
		return nil, "", errors.New("Invalid email or password")
	}

	// Validate password
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		return nil, "", errors.New("Invalid email or password")
	}

	// Check email verification status
	if !user.IsVerified {
		return nil, "", errors.New("Please verify your email before logging in")
	}

	// Fetch IP Geolocation details
	details, _ := s.ipgeoClient.GetDetails(ipAddress)
	device := ipgeo.ParseUserAgent(userAgent)

	locationStr := "Unknown Location"
	ispStr := "Unknown ISP"
	connType := "Unknown Connection"
	flagURL := ""
	if details != nil {
		locationStr = fmt.Sprintf("%s, %s, %s %s", details.City, details.StateProv, details.CountryName, details.CountryEmoji)
		ispStr = details.ISP
		connType = details.ConnectionTy
		flagURL = details.CountryFlag
	}

	// Generate UUID for the session
	tokenID := uuid.New().String()
	sessionExpiresAt := time.Now().Add(72 * time.Hour)

	// Create User Session record
	session := &models.UserSession{
		UserID:       user.ID,
		TokenID:      tokenID,
		IPAddress:    ipAddress,
		UserAgent:    userAgent,
		Device:       device,
		Location:     locationStr,
		ISP:          ispStr,
		ConnectionTy: connType,
		CountryFlag:  flagURL,
		IsActive:     true,
		ExpiresAt:    sessionExpiresAt,
	}

	if err := s.securityRepo.CreateSession(session); err != nil {
		return nil, "", fmt.Errorf("failed to create session: %w", err)
	}
	s.cacheUserIndex(user)
	s.cacheSessionIndex(user, session)

	// Log security event
	go func() {
		logEntry := &models.UserSecurityLog{
			UserID:       user.ID,
			Action:       "Login",
			IPAddress:    ipAddress,
			UserAgent:    userAgent,
			Device:       device,
			Location:     locationStr,
			ISP:          ispStr,
			ConnectionTy: connType,
			CountryFlag:  flagURL,
		}
		_ = s.securityRepo.CreateSecurityLog(logEntry)
	}()

	s.notifService.Notify(user.ID, "New Login Detected", fmt.Sprintf("Logged in successfully from IP: %s (%s)", ipAddress, device), "info")

	// Generate JWT Token containing user metadata and session token ID
	tokenString, err := s.generateJWT(user, tokenID)
	if err != nil {
		return nil, "", err
	}

	return user, tokenString, nil
}

func (s *AuthService) cacheUserIndex(user *models.User) {
	if s.redisService == nil || !s.redisService.IsActive() || user == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	resp := user.ToResponse()
	ttl := 24 * time.Hour
	_ = s.redisService.Set(ctx, fmt.Sprintf("user:id:%d", user.ID), resp, ttl)
	_ = s.redisService.Set(ctx, fmt.Sprintf("user:email:%s", strings.ToLower(user.Email)), resp, ttl)
	if user.Name != "" {
		_ = s.redisService.Set(ctx, fmt.Sprintf("user:name:%s:%d", normalizeIndexValue(user.Name), user.ID), resp, ttl)
	}
}

func (s *AuthService) cacheSessionIndex(user *models.User, session *models.UserSession) {
	if s.redisService == nil || !s.redisService.IsActive() || user == nil || session == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	ttl := time.Until(session.ExpiresAt)
	if ttl <= 0 {
		return
	}

	_ = s.redisService.Set(ctx, fmt.Sprintf("session:%s", session.TokenID), map[string]interface{}{
		"user_id":    user.ID,
		"email":      user.Email,
		"name":       user.Name,
		"role":       user.Role,
		"ip_address": session.IPAddress,
		"device":     session.Device,
		"expires_at": session.ExpiresAt,
	}, ttl)
}

func normalizeIndexValue(value string) string {
	return strings.Join(strings.Fields(strings.ToLower(value)), "-")
}

// ForgotPassword generates a reset token and sends reset link via email.
func (s *AuthService) ForgotPassword(req *models.ForgotPasswordRequest, ipAddress, userAgent string) error {
	user, err := s.userRepo.FindByEmail(req.Email)
	if err != nil {
		// Return success anyway for security to prevent user enumeration
		return nil
	}

	// Generate reset token
	token, err := s.generateSecureToken()
	if err != nil {
		return err
	}

	expiresAt := time.Now().Add(1 * time.Hour) // Reset token valid for 1 hour

	user.PasswordResetToken = token
	user.PasswordResetTokenExpiresAt = &expiresAt

	if err := s.userRepo.Update(user); err != nil {
		return fmt.Errorf("failed to generate reset token: %w", err)
	}

	// Log security event
	go func() {
		details, _ := s.ipgeoClient.GetDetails(ipAddress)
		logEntry := &models.UserSecurityLog{
			UserID:    user.ID,
			Action:    "Password Reset Request",
			IPAddress: ipAddress,
			UserAgent: userAgent,
			Device:    ipgeo.ParseUserAgent(userAgent),
		}
		if details != nil {
			logEntry.Location = fmt.Sprintf("%s, %s, %s %s", details.City, details.StateProv, details.CountryName, details.CountryEmoji)
			logEntry.ISP = details.ISP
			logEntry.ConnectionTy = details.ConnectionTy
			logEntry.CountryFlag = details.CountryFlag
		}
		_ = s.securityRepo.CreateSecurityLog(logEntry)
	}()

	// Send password reset email
	resetURL := fmt.Sprintf("http://localhost:%s/api/v1/auth/reset-password?token=%s", s.cfg.Port, token)
	emailBody, err := email.GetPasswordResetTemplate(user.Name, resetURL)
	if err != nil {
		return fmt.Errorf("failed to render reset email: %w", err)
	}

	go func() {
		_ = s.emailSender.Send(user.Email, "Reset Your Password", emailBody)
	}()

	return nil
}

// ResetPassword verifies the reset token, updates the password, revokes ALL active sessions, and returns IPDetails.
func (s *AuthService) ResetPassword(req *models.ResetPasswordRequest, ipAddress, userAgent string) (*ipgeo.IPDetails, string, error) {
	user, err := s.userRepo.FindByPasswordResetToken(req.Token)
	if err != nil {
		return nil, "", errors.New("invalid or expired password reset token")
	}

	if user.PasswordResetTokenExpiresAt == nil || time.Now().After(*user.PasswordResetTokenExpiresAt) {
		return nil, "", errors.New("password reset token has expired")
	}

	// Hash new password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", fmt.Errorf("failed to hash password: %w", err)
	}

	user.Password = string(hashedPassword)
	user.PasswordResetToken = ""
	user.PasswordResetTokenExpiresAt = nil

	if err := s.userRepo.Update(user); err != nil {
		return nil, "", fmt.Errorf("failed to reset password: %w", err)
	}

	// Fetch IP Geolocation details
	details, _ := s.ipgeoClient.GetDetails(ipAddress)
	device := ipgeo.ParseUserAgent(userAgent)

	locationStr := "Unknown Location"
	ispStr := "Unknown ISP"
	connType := "Unknown Connection"
	flagURL := ""
	if details != nil {
		locationStr = fmt.Sprintf("%s, %s, %s %s", details.City, details.StateProv, details.CountryName, details.CountryEmoji)
		ispStr = details.ISP
		connType = details.ConnectionTy
		flagURL = details.CountryFlag
	}

	// Log security event
	go func() {
		logEntry := &models.UserSecurityLog{
			UserID:       user.ID,
			Action:       "Password Reset Success",
			IPAddress:    ipAddress,
			UserAgent:    userAgent,
			Device:       device,
			Location:     locationStr,
			ISP:          ispStr,
			ConnectionTy: connType,
			CountryFlag:  flagURL,
		}
		_ = s.securityRepo.CreateSecurityLog(logEntry)
	}()

	s.notifService.Notify(user.ID, "Password Reset Successful", "Your account password has been reset successfully.", "warning")

	// Revoke ALL active sessions for this user! (Force-logout everywhere for security)
	_ = s.securityRepo.RevokeAllOtherSessions(user.ID, "") // Passing empty string revokes all

	// Return resolved IP details back to the handler to display on landing page
	return details, device, nil
}

// ResendVerification generates a new token and sends a new verification email.
func (s *AuthService) ResendVerification(req *models.ResendVerificationRequest, ipAddress, userAgent string) error {
	user, err := s.userRepo.FindByEmail(req.Email)
	if err != nil {
		return errors.New("no account found with this email address")
	}

	if user.IsVerified {
		return errors.New("this email address is already verified")
	}

	token, err := s.generateSecureToken()
	if err != nil {
		return err
	}

	expiresAt := time.Now().Add(24 * time.Hour)

	user.VerificationToken = token
	user.VerificationExpiresAt = &expiresAt

	if err := s.userRepo.Update(user); err != nil {
		return fmt.Errorf("failed to refresh verification token: %w", err)
	}

	// Log security event
	go func() {
		details, _ := s.ipgeoClient.GetDetails(ipAddress)
		logEntry := &models.UserSecurityLog{
			UserID:    user.ID,
			Action:    "Verification Email Resend",
			IPAddress: ipAddress,
			UserAgent: userAgent,
			Device:    ipgeo.ParseUserAgent(userAgent),
		}
		if details != nil {
			logEntry.Location = fmt.Sprintf("%s, %s, %s %s", details.City, details.StateProv, details.CountryName, details.CountryEmoji)
			logEntry.ISP = details.ISP
			logEntry.ConnectionTy = details.ConnectionTy
			logEntry.CountryFlag = details.CountryFlag
		}
		_ = s.securityRepo.CreateSecurityLog(logEntry)
	}()

	// Send verification email
	verifyURL := fmt.Sprintf("http://localhost:%s/api/v1/auth/verify-email?token=%s", s.cfg.Port, token)
	emailBody, err := email.GetVerificationTemplate(user.Name, verifyURL)
	if err != nil {
		return fmt.Errorf("failed to render verification email: %w", err)
	}

	go func() {
		_ = s.emailSender.Send(user.Email, "Verify Your Email Address", emailBody)
	}()

	return nil
}

// Helper: Generates high entropy tokens for verification and password resets
func (s *AuthService) generateSecureToken() (string, error) {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	if err != nil {
		return "", fmt.Errorf("failed to generate secure token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// Helper: Generates a JWT signed token including User ID, Email, and Session UUID
func (s *AuthService) generateJWT(user *models.User, tokenID string) (string, error) {
	claims := jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"role":  user.Role,
		"sid":   tokenID, // Session Token ID
		"exp":   time.Now().Add(72 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		return "", fmt.Errorf("failed to sign JWT: %w", err)
	}

	return tokenString, nil
}

// ChangePassword updates an authenticated user's password after validating their current password.
func (s *AuthService) ChangePassword(userID uint, req *models.ChangePasswordRequest, ipAddress, userAgent string) error {
	if req.NewPassword != req.ConfirmNewPassword {
		return errors.New("New password and confirm password do not match")
	}

	user, err := s.userRepo.FindByID(userID)
	if err != nil {
		return errors.New("User not found")
	}

	// Verify current password
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.CurrentPassword)); err != nil {
		return errors.New("Incorrect current password")
	}

	// Hash new password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	user.Password = string(hashedPassword)
	if err := s.userRepo.Update(user); err != nil {
		return fmt.Errorf("failed to update user password: %w", err)
	}

	// Log security event
	go func() {
		details, _ := s.ipgeoClient.GetDetails(ipAddress)
		logEntry := &models.UserSecurityLog{
			UserID:    user.ID,
			Action:    "Password Change",
			IPAddress: ipAddress,
			UserAgent: userAgent,
			Device:    ipgeo.ParseUserAgent(userAgent),
		}
		if details != nil {
			logEntry.Location = fmt.Sprintf("%s, %s, %s %s", details.City, details.StateProv, details.CountryName, details.CountryEmoji)
			logEntry.ISP = details.ISP
			logEntry.ConnectionTy = details.ConnectionTy
			logEntry.CountryFlag = details.CountryFlag
		}
		_ = s.securityRepo.CreateSecurityLog(logEntry)
	}()

	s.notifService.Notify(user.ID, "Password Changed", "You have successfully changed your account password.", "warning")

	return nil
}
