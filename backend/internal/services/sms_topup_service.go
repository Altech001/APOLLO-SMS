package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"backend/internal/models"
	"backend/internal/repository"
	"backend/pkg/email"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// NewSMSTopupService instantiates a new SMSTopupService.
func NewSMSTopupService(
	db *gorm.DB,
	topupRepo *repository.SMSTopupRepository,
	userRepo *repository.UserRepository,
	notifService *NotificationService,
	smsConfigService *SMSConfigService,
	redisService *RedisService,
) *SMSTopupService {
	return &SMSTopupService{
		db:               db,
		topupRepo:        topupRepo,
		userRepo:         userRepo,
		notifService:     notifService,
		smsConfigService: smsConfigService,
		redisService:     redisService,
		emailSender:      nil,
	}
}

// SMSTopupService manages SMS credit transactions and top-up histories.
type SMSTopupService struct {
	db               *gorm.DB
	topupRepo        *repository.SMSTopupRepository
	userRepo         *repository.UserRepository
	notifService     *NotificationService
	smsConfigService *SMSConfigService
	redisService     *RedisService
	emailSender      *email.EmailSender
}

// PerformTopup updates user's SMS balance and logs the transaction atomically.
func (s *SMSTopupService) PerformTopup(userID uint, req *models.SMSTopupRequest) (*models.SMSTopupResponse, error) {
	var res models.SMSTopupResponse
	var updatedUser models.User

	recipientEmailInput := strings.TrimSpace(req.RecipientEmail)
	if req.RecipientID > 0 || recipientEmailInput != "" {
		if req.Amount <= 0 {
			return nil, errors.New("amount must be greater than zero")
		}

		credits := req.Amount
		var recipientEmail string
		var recipientBalance int
		var recipientID uint
		err := s.db.Transaction(func(tx *gorm.DB) error {
			var sender models.User
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&sender, userID).Error; err != nil {
				return errors.New("user not found")
			}

			var recipient models.User
			recipientQuery := tx.Clauses(clause.Locking{Strength: "UPDATE"})
			if req.RecipientID > 0 {
				if err := recipientQuery.First(&recipient, req.RecipientID).Error; err != nil {
					return errors.New("recipient user not found")
				}
			} else {
				if err := recipientQuery.Where("LOWER(email) = LOWER(?)", recipientEmailInput).First(&recipient).Error; err != nil {
					return errors.New("recipient user not found")
				}
			}

			if err := s.validateTransferRequest(sender, recipient, credits); err != nil {
				return err
			}

			recipientEmail = recipient.Email
			recipientBalance = recipient.SMSBalance + credits
			recipientID = recipient.ID
			sender.SMSBalance -= credits
			recipient.SMSBalance += credits
			if err := tx.Save(&sender).Error; err != nil {
				return fmt.Errorf("failed to update sender SMS balance: %w", err)
			}
			if err := tx.Save(&recipient).Error; err != nil {
				return fmt.Errorf("failed to update recipient SMS balance: %w", err)
			}
			updatedUser = sender

			topup := &models.SMSTopup{
				UserID:      userID,
				Amount:      credits,
				AmountUGX:   0,
				PricePerSMS: 0,
				Description: req.Description,
				Reference:   req.Reference,
			}
			if err := s.topupRepo.CreateWithTx(tx, topup); err != nil {
				return fmt.Errorf("failed to save transfer record: %w", err)
			}
			res = topup.ToResponse()
			return nil
		})
		if err != nil {
			return nil, err
		}

		s.cacheTopupUser(&updatedUser)
		s.notifService.Notify(userID, "SMS Balance Transfer", fmt.Sprintf("You sent %d SMS credits. New balance: %d", credits, updatedUser.SMSBalance), "success")
		if recipientID > 0 {
			s.notifService.Notify(recipientID, "SMS Credits Received", fmt.Sprintf("You received %d SMS credits. New balance: %d", credits, recipientBalance), "success")
		}
		if s.emailSender != nil && recipientEmail != "" {
			_ = s.emailSender.Send(recipientEmail, "You received SMS credits", fmt.Sprintf("<p>Hello,</p><p>You received <strong>%d</strong> SMS credits from another user.</p><p>Your current balance is <strong>%d</strong> SMS credits.</p>", credits, recipientBalance))
		}
		return &res, nil
	}

	amountUGX := req.AmountUGX
	if amountUGX <= 0 {
		amountUGX = req.Amount
	}
	if amountUGX <= 0 {
		return nil, errors.New("amount or amount_ugx must be greater than zero")
	}

	pricePerSMS, err := s.smsConfigService.PriceForAmountUGX(amountUGX)
	if err != nil {
		return nil, err
	}
	credits := amountUGX / pricePerSMS
	if credits <= 0 {
		return nil, fmt.Errorf("amount_ugx is too low to buy SMS credits at %d UGX per SMS", pricePerSMS)
	}

	// Run within GORM database transaction to guarantee ACID updates
	err = s.db.Transaction(func(tx *gorm.DB) error {
		var sender models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&sender, userID).Error; err != nil {
			return errors.New("user not found")
		}

		if sender.SMSBalance < credits {
			return fmt.Errorf("insufficient SMS balance: available %d, required %d", sender.SMSBalance, credits)
		}

		// Update balance
		sender.SMSBalance += credits
		if err := tx.Save(&sender).Error; err != nil {
			return fmt.Errorf("failed to update user SMS balance: %w", err)
		}
		updatedUser = sender

		// Create Topup audit entry
		topup := &models.SMSTopup{
			UserID:      userID,
			Amount:      credits,
			AmountUGX:   amountUGX,
			PricePerSMS: pricePerSMS,
			Description: req.Description,
			Reference:   req.Reference,
		}
		if err := s.topupRepo.CreateWithTx(tx, topup); err != nil {
			return fmt.Errorf("failed to save topup record: %w", err)
		}

		res = topup.ToResponse()
		return nil
	})

	if err != nil {
		return nil, err
	}

	s.cacheTopupUser(&updatedUser)
	s.notifService.Notify(userID, "SMS Balance Top-Up", fmt.Sprintf("Your balance was topped up by %d SMS credits. New balance: %d", credits, updatedUser.SMSBalance), "success")

	return &res, nil
}

// AdminAdjustBalance credits or debits a user's SMS or WhatsApp balance. SMS changes are logged
// in the top-up history with a negative amount for debits.
func (s *SMSTopupService) AdminAdjustBalance(userID uint, req *models.AdminAdjustBalanceRequest) (*models.UserResponse, error) {
	kind := strings.ToLower(strings.TrimSpace(req.Kind))
	action := strings.ToLower(strings.TrimSpace(req.Action))
	reason := strings.TrimSpace(req.Reason)
	if kind != models.BalanceKindSMS && kind != models.BalanceKindWhatsApp {
		return nil, errors.New("kind must be sms or whatsapp")
	}
	if action != models.BalanceCredit && action != models.BalanceDebit {
		return nil, errors.New("action must be credit or debit")
	}
	if req.Amount <= 0 {
		return nil, errors.New("amount must be greater than zero")
	}
	delta := req.Amount
	if action == models.BalanceDebit {
		delta = -req.Amount
	}

	var user models.User
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return errors.New("user not found")
		}
		current := &user.SMSBalance
		column := "sms_balance"
		if kind == models.BalanceKindWhatsApp {
			current = &user.WhatsAppBalance
			column = "whatsapp_balance"
		}
		if *current+delta < 0 {
			return fmt.Errorf("cannot debit %d: the user only has %d", req.Amount, *current)
		}
		*current += delta
		if err := tx.Model(&models.User{}).Where("id = ?", userID).Update(column, *current).Error; err != nil {
			return fmt.Errorf("failed to update balance: %w", err)
		}
		if kind != models.BalanceKindSMS {
			return nil
		}
		description := "Admin " + action
		if reason != "" {
			description += ": " + reason
		}
		return s.topupRepo.CreateWithTx(tx, &models.SMSTopup{UserID: userID, Amount: delta, Description: description, Reference: "admin-adjustment"})
	})
	if err != nil {
		return nil, err
	}

	s.cacheTopupUser(&user)
	label := "SMS"
	balance := user.SMSBalance
	if kind == models.BalanceKindWhatsApp {
		label = "WhatsApp"
		balance = user.WhatsAppBalance
	}
	verb := "added to"
	if action == models.BalanceDebit {
		verb = "removed from"
	}
	message := fmt.Sprintf("%d %s credits were %s your account. New balance: %d", req.Amount, label, verb, balance)
	if reason != "" {
		message += ". Reason: " + reason
	}
	s.notifService.Notify(userID, label+" Balance Adjusted", message, "info")

	res := user.ToResponse()
	return &res, nil
}

func (s *SMSTopupService) validateTransferRequest(sender, recipient models.User, credits int) error {
	if sender.ID == 0 || recipient.ID == 0 {
		return errors.New("sender and recipient are required")
	}
	if sender.ID == recipient.ID {
		return errors.New("you cannot transfer to yourself")
	}
	if sender.SMSBalance < credits {
		return fmt.Errorf("insufficient SMS balance: available %d, required %d", sender.SMSBalance, credits)
	}
	return nil
}

func (s *SMSTopupService) SetEmailSender(emailSender *email.EmailSender) {
	s.emailSender = emailSender
}

func (s *SMSTopupService) cacheTopupUser(user *models.User) {
	if s.redisService == nil || !s.redisService.IsActive() || user == nil || user.ID == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	resp := user.ToResponse()
	ttl := 24 * time.Hour
	_ = s.redisService.Set(ctx, fmt.Sprintf("user:id:%d", user.ID), resp, ttl)
	_ = s.redisService.Set(ctx, fmt.Sprintf("user:email:%s", user.Email), resp, ttl)
	if user.Name != "" {
		_ = s.redisService.Set(ctx, fmt.Sprintf("user:name:%s:%d", normalizeIndexValue(user.Name), user.ID), resp, ttl)
	}
}

// GetTopupsForUser retrieves the topup history for a specific user.
func (s *SMSTopupService) GetTopupsForUser(userID uint) ([]models.SMSTopupResponse, error) {
	topups, err := s.topupRepo.FindByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve user topups: %w", err)
	}

	res := make([]models.SMSTopupResponse, len(topups))
	for i, t := range topups {
		res[i] = t.ToResponse()
	}
	return res, nil
}

// GetAllTopups retrieves all topup logs (Admin audit).
func (s *SMSTopupService) GetAllTopups() ([]models.SMSTopupResponse, error) {
	topups, err := s.topupRepo.FindAll()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve all topups: %w", err)
	}

	res := make([]models.SMSTopupResponse, len(topups))
	for i, t := range topups {
		res[i] = t.ToResponse()
	}
	return res, nil
}
