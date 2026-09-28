package services

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math/big"
	"regexp"
	"strings"
	"time"

	"backend/internal/models"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	authCodeTTL         = 10 * time.Minute
	authCodeMaxAttempts = 5
	authSMSCooldown     = 60 * time.Second
	authSMSDailyLimit   = 5 // per user, across verification and reset, so nobody can drain an account
	verifyTicketTTL     = 30 * time.Minute
	verifyTicketType    = "verify_ticket"
)

var e164Pattern = regexp.MustCompile(`^\+[1-9]\d{7,14}$`)

// NormalizePhone converts user input to E.164 (+256712345678). A leading 0 is read as a Ugandan
// local number. It returns an error when the result is not a plausible international number.
func NormalizePhone(raw string) (string, error) {
	phone := strings.NewReplacer(" ", "", "-", "", "(", "", ")", "", ".", "").Replace(strings.TrimSpace(raw))
	switch {
	case strings.HasPrefix(phone, "00"):
		phone = "+" + phone[2:]
	case strings.HasPrefix(phone, "0"):
		phone = "+256" + phone[1:]
	case phone != "" && !strings.HasPrefix(phone, "+"):
		phone = "+" + phone
	}
	if !e164Pattern.MatchString(phone) {
		return "", errors.New("Enter a valid phone number with its country code")
	}
	return phone, nil
}

// MaskPhone hides the middle of a phone number: +256712345678 -> +2567•••••678.
func MaskPhone(phone string) string {
	if len(phone) <= 8 {
		return phone
	}
	return phone[:5] + strings.Repeat("•", len(phone)-8) + phone[len(phone)-3:]
}

// SetSMS wires the SMS gateway used for verification and reset codes.
func (s *AuthService) SetSMS(db *gorm.DB, smsService *SMSConfigService) {
	s.db = db
	s.smsService = smsService
}

// VerificationRequiredError is returned by Login when the password is right but the account is unverified.
type VerificationRequiredError struct {
	Info models.VerificationRequiredResponse
}

func (e *VerificationRequiredError) Error() string {
	return "Please verify your account to continue"
}

func (s *AuthService) verificationInfo(user *models.User) (models.VerificationRequiredResponse, error) {
	ticket, err := s.issueVerificationTicket(user)
	if err != nil {
		return models.VerificationRequiredResponse{}, err
	}
	info := models.VerificationRequiredResponse{
		Email:     user.Email,
		Ticket:    ticket,
		HasPhone:  user.Phone != "",
		SMSFeeUGX: s.cfg.AuthSMSFeeUGX,
	}
	if user.Phone != "" {
		info.MaskedPhone = MaskPhone(user.Phone)
	}
	return info, nil
}

// ticketKey is separate from the session JWT key so a ticket can never pass as a login token.
func (s *AuthService) ticketKey() []byte {
	return []byte(s.cfg.JWTSecret + ":" + verifyTicketType)
}

func (s *AuthService) issueVerificationTicket(user *models.User) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": user.ID,
		"typ": verifyTicketType,
		"exp": time.Now().Add(verifyTicketTTL).Unix(),
	})
	signed, err := token.SignedString(s.ticketKey())
	if err != nil {
		return "", fmt.Errorf("failed to sign verification ticket: %w", err)
	}
	return signed, nil
}

var errTicketExpired = errors.New("Your verification session expired. Please log in again")

func (s *AuthService) userFromTicket(ticket string) (*models.User, error) {
	userID, err := s.ticketUserID(ticket)
	if err != nil {
		return nil, err
	}
	user, err := s.userRepo.FindByID(userID)
	if err != nil {
		return nil, errTicketExpired
	}
	return user, nil
}

// ticketUserID validates a verification ticket and returns the user it was issued to.
func (s *AuthService) ticketUserID(ticket string) (uint, error) {
	token, err := jwt.Parse(strings.TrimSpace(ticket), func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return s.ticketKey(), nil
	})
	if err != nil || !token.Valid {
		return 0, errTicketExpired
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || claims["typ"] != verifyTicketType {
		return 0, errTicketExpired
	}
	sub, ok := claims["sub"].(float64)
	if !ok || sub <= 0 {
		return 0, errTicketExpired
	}
	return uint(sub), nil
}

// SendVerificationSMS sends an account verification code to the user's registered phone.
func (s *AuthService) SendVerificationSMS(ticket string) (*models.SMSCodeSentResponse, error) {
	user, err := s.userFromTicket(ticket)
	if err != nil {
		return nil, err
	}
	if user.IsVerified {
		return nil, errors.New("This account is already verified. You can log in")
	}
	return s.sendAuthCode(user, models.AuthPurposeVerify)
}

// VerifyWithSMSCode marks the account verified and starts a login session.
func (s *AuthService) VerifyWithSMSCode(req *models.VerifySMSCodeRequest, ipAddress, userAgent string) (*models.User, string, error) {
	user, err := s.userFromTicket(req.Ticket)
	if err != nil {
		return nil, "", err
	}
	if !user.IsVerified {
		if err := s.checkAuthCode(user.ID, models.AuthPurposeVerify, req.Code); err != nil {
			return nil, "", err
		}
		user.IsVerified = true
		user.VerificationToken = ""
		user.VerificationExpiresAt = nil
		if err := s.userRepo.Update(user); err != nil {
			return nil, "", fmt.Errorf("failed to verify account: %w", err)
		}
		s.logSecurityEvent(user.ID, "Phone Verified", ipAddress, userAgent)
		s.notifService.Notify(user.ID, "Account Verified", "Your account was verified with a code sent to your phone.", "success")
	}

	token, err := s.startSession(user, ipAddress, userAgent)
	if err != nil {
		return nil, "", err
	}
	return user, token, nil
}

// sendAuthCode charges the user, stores a fresh hashed code and sends it by SMS. The charge is
// refunded when every SMS provider fails.
func (s *AuthService) sendAuthCode(user *models.User, purpose string) (*models.SMSCodeSentResponse, error) {
	if s.smsService == nil || s.db == nil {
		return nil, errors.New("SMS codes are not available right now. Please use the email option")
	}
	if user.Phone == "" {
		return nil, errors.New("This account has no phone number. Please use the email option")
	}

	code, err := randomDigits(6)
	if err != nil {
		return nil, err
	}
	credits := max(0, s.cfg.AuthSMSFeeCredits)
	fee := s.cfg.AuthSMSFeeUGX

	var charge models.AuthSMSCharge
	err = s.db.Transaction(func(tx *gorm.DB) error {
		// The row lock serialises concurrent requests for the same user, so the cooldown and daily
		// limit below cannot be raced.
		var locked models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&locked, user.ID).Error; err != nil {
			return errors.New("account not found")
		}

		var last models.AuthSMSCharge
		if err := tx.Where("user_id = ?", user.ID).Order("created_at DESC").First(&last).Error; err == nil {
			if wait := authSMSCooldown - time.Since(last.CreatedAt); wait > 0 {
				return fmt.Errorf("Please wait %d seconds before requesting another code", int(wait.Seconds())+1)
			}
		}
		var sentToday int64
		if err := tx.Model(&models.AuthSMSCharge{}).
			Where("user_id = ? AND created_at > ?", user.ID, time.Now().Add(-24*time.Hour)).
			Count(&sentToday).Error; err != nil {
			return err
		}
		if sentToday >= authSMSDailyLimit {
			return errors.New("Too many SMS codes were requested today. Please use the email option or try again tomorrow")
		}

		if locked.SMSBalance < credits {
			return fmt.Errorf("Not enough SMS balance: this code costs %d UGX (%d SMS credit). Top up or use the email option", fee, credits)
		}
		if err := tx.Model(&locked).Update("sms_balance", gorm.Expr("sms_balance - ?", credits)).Error; err != nil {
			return err
		}

		// Only the newest code of a purpose is valid.
		now := time.Now()
		if err := tx.Model(&models.AuthCode{}).
			Where("user_id = ? AND purpose = ? AND consumed_at IS NULL", user.ID, purpose).
			Update("consumed_at", now).Error; err != nil {
			return err
		}
		if err := tx.Create(&models.AuthCode{
			UserID:    user.ID,
			Purpose:   purpose,
			CodeHash:  s.hashAuthCode(user.ID, purpose, code),
			Phone:     user.Phone,
			ExpiresAt: now.Add(authCodeTTL),
		}).Error; err != nil {
			return err
		}

		charge = models.AuthSMSCharge{
			UserID:    user.ID,
			Purpose:   purpose,
			Phone:     user.Phone,
			Credits:   credits,
			AmountUGX: fee,
			Status:    models.AuthChargeCharged,
		}
		return tx.Create(&charge).Error
	})
	if err != nil {
		return nil, err
	}

	label := "verification"
	if purpose == models.AuthPurposeReset {
		label = "password reset"
	}
	message := fmt.Sprintf("Your LucoSMS %s code is %s. It expires in %d minutes. Never share this code.", label, code, int(authCodeTTL.Minutes()))

	resp, sendErr := s.smsService.SendSMS(&models.SendSMSRequest{Phone: user.Phone, Message: message})
	if sendErr != nil {
		log.Printf("❌ Auth SMS (%s) to user %d failed: %v", purpose, user.ID, sendErr)
		s.refundAuthSMS(&charge, sendErr)
		return nil, errors.New("We couldn't send the SMS right now and you were not charged. Please try again or use the email option")
	}

	_ = s.db.Model(&charge).Update("provider", resp.Provider).Error
	s.notifService.Notify(user.ID, "SMS Code Sent",
		fmt.Sprintf("A %s code was sent to %s. %d UGX was charged to your SMS balance.", label, MaskPhone(user.Phone), fee), "info")

	return &models.SMSCodeSentResponse{
		Message:     fmt.Sprintf("Code sent to %s", MaskPhone(user.Phone)),
		MaskedPhone: MaskPhone(user.Phone),
		ChargedUGX:  fee,
		ExpiresIn:   int(authCodeTTL.Seconds()),
	}, nil
}

func (s *AuthService) refundAuthSMS(charge *models.AuthSMSCharge, cause error) {
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.User{}).Where("id = ?", charge.UserID).
			Update("sms_balance", gorm.Expr("sms_balance + ?", charge.Credits)).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.AuthCode{}).
			Where("user_id = ? AND purpose = ? AND consumed_at IS NULL", charge.UserID, charge.Purpose).
			Update("consumed_at", time.Now()).Error; err != nil {
			return err
		}
		return tx.Model(charge).Updates(map[string]interface{}{
			"status": models.AuthChargeRefunded,
			"error":  cause.Error(),
		}).Error
	})
	if err != nil {
		log.Printf("❌ Failed to refund auth SMS charge %d for user %d: %v", charge.ID, charge.UserID, err)
	}
}

// checkAuthCode validates and consumes the newest code for a purpose.
func (s *AuthService) checkAuthCode(userID uint, purpose, code string) error {
	if s.db == nil {
		return errors.New("SMS codes are not available right now")
	}
	code = strings.TrimSpace(code)

	var stored models.AuthCode
	err := s.db.Where("user_id = ? AND purpose = ? AND consumed_at IS NULL", userID, purpose).
		Order("created_at DESC").First(&stored).Error
	if err != nil || time.Now().After(stored.ExpiresAt) {
		return errors.New("This code has expired. Please request a new one")
	}
	if stored.Attempts >= authCodeMaxAttempts {
		return errors.New("Too many wrong attempts. Please request a new code")
	}

	expected := s.hashAuthCode(userID, purpose, code)
	if !hmac.Equal([]byte(expected), []byte(stored.CodeHash)) {
		_ = s.db.Model(&stored).Update("attempts", gorm.Expr("attempts + 1")).Error
		left := authCodeMaxAttempts - stored.Attempts - 1
		if left <= 0 {
			return errors.New("Too many wrong attempts. Please request a new code")
		}
		return fmt.Errorf("Incorrect code. %d attempt(s) left", left)
	}

	// The conditional update makes a code single-use even under concurrent submits.
	res := s.db.Model(&models.AuthCode{}).Where("id = ? AND consumed_at IS NULL", stored.ID).Update("consumed_at", time.Now())
	if res.Error != nil || res.RowsAffected == 0 {
		return errors.New("This code was already used. Please request a new one")
	}
	return nil
}

func (s *AuthService) hashAuthCode(userID uint, purpose, code string) string {
	mac := hmac.New(sha256.New, []byte(s.cfg.JWTSecret))
	fmt.Fprintf(mac, "%d:%s:%s", userID, purpose, code)
	return hex.EncodeToString(mac.Sum(nil))
}

func randomDigits(n int) (string, error) {
	var b strings.Builder
	for i := 0; i < n; i++ {
		d, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", fmt.Errorf("failed to generate code: %w", err)
		}
		b.WriteByte(byte('0' + d.Int64()))
	}
	return b.String(), nil
}
