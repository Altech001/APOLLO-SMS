package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	"backend/internal/models"
	"backend/internal/repository"
	"backend/pkg/storage"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// UserService handles User CRUD business logic.
type UserService struct {
	userRepo        *repository.UserRepository
	storageProvider storage.StorageProvider
	db              *gorm.DB
	whatsapp        *WhatsAppService
}

// NewUserService creates a new UserService.
func NewUserService(userRepo *repository.UserRepository, storageProvider storage.StorageProvider, db *gorm.DB) *UserService {
	return &UserService{userRepo: userRepo, storageProvider: storageProvider, db: db}
}

// SetWhatsAppService lets account deletion unlink WhatsApp devices after all services are wired.
func (s *UserService) SetWhatsAppService(service *WhatsAppService) {
	s.whatsapp = service
}

// GetAllUsers lists all users in the system.
func (s *UserService) GetAllUsers() ([]models.UserResponse, error) {
	users, err := s.userRepo.FindAll()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve users: %w", err)
	}

	res := make([]models.UserResponse, 0, len(users))
	for _, u := range users {
		res = append(res, u.ToResponse())
	}
	return res, nil
}

// GetUserByID returns details of a single user.
func (s *UserService) GetUserByID(id uint) (*models.UserResponse, error) {
	user, err := s.userRepo.FindByID(id)
	if err != nil {
		return nil, errors.New("user not found")
	}

	res := user.ToResponse()
	return &res, nil
}

// SearchCreditRecipients finds possible transfer recipients without returning balances or roles.
func (s *UserService) SearchCreditRecipients(query string, currentUserID uint) ([]models.CreditRecipientResponse, error) {
	query = strings.TrimSpace(query)
	if len(query) < 2 {
		return []models.CreditRecipientResponse{}, nil
	}

	users, err := s.userRepo.SearchCreditRecipients(query, currentUserID, 8)
	if err != nil {
		return nil, fmt.Errorf("failed to search recipients: %w", err)
	}

	res := make([]models.CreditRecipientResponse, 0, len(users))
	for _, user := range users {
		res = append(res, user.ToCreditRecipientResponse())
	}
	return res, nil
}

// UpdateProfile updates the authenticated user's editable profile fields.
func (s *UserService) UpdateProfile(id uint, name, email string) (*models.UserResponse, error) {
	user, err := s.userRepo.FindByID(id)
	if err != nil {
		return nil, errors.New("user not found")
	}

	if user.Email != email {
		existing, _ := s.userRepo.FindByEmail(email)
		if existing != nil {
			return nil, errors.New("Email address already taken")
		}
	}

	user.Name = name
	user.Email = email

	if err := s.userRepo.Update(user); err != nil {
		return nil, fmt.Errorf("failed to update profile: %w", err)
	}

	res := user.ToResponse()
	return &res, nil
}

// CreateUser creates a new user directly (Admin function).
func (s *UserService) CreateUser(req *models.CreateUserRequest) (*models.UserResponse, error) {
	existing, _ := s.userRepo.FindByEmail(req.Email)
	if existing != nil {
		return nil, errors.New("Email address already taken")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	user := &models.User{
		Name:       req.Name,
		Email:      req.Email,
		Password:   string(hashedPassword),
		Role:       req.Role,
		SMSBalance: req.SMSBalance,
		IsVerified: true, // Admin created users are verified by default
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	res := user.ToResponse()
	return &res, nil
}

// UpdateUser updates user details.
func (s *UserService) UpdateUser(id uint, req *models.UpdateUserRequest) (*models.UserResponse, error) {
	user, err := s.userRepo.FindByID(id)
	if err != nil {
		return nil, errors.New("user not found")
	}

	// Email duplicate check
	if user.Email != req.Email {
		existing, _ := s.userRepo.FindByEmail(req.Email)
		if existing != nil {
			return nil, errors.New("Email address already taken")
		}
	}

	user.Name = req.Name
	user.Email = req.Email
	user.Role = req.Role
	user.SMSBalance = req.SMSBalance

	// Hash password only if a new one was provided
	if req.Password != "" {
		hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("failed to hash password: %w", err)
		}
		user.Password = string(hashed)
	}

	if err := s.userRepo.Update(user); err != nil {
		return nil, fmt.Errorf("failed to update user: %w", err)
	}

	res := user.ToResponse()
	return &res, nil
}

// SetVerified manually verifies or unverifies a user (admin).
func (s *UserService) SetVerified(id uint, verified bool) (*models.UserResponse, error) {
	user, err := s.userRepo.FindByID(id)
	if err != nil {
		return nil, errors.New("user not found")
	}
	user.IsVerified = verified
	if verified {
		user.VerificationToken = ""
		user.VerificationExpiresAt = nil
	}
	if err := s.userRepo.Update(user); err != nil {
		return nil, fmt.Errorf("failed to update verification: %w", err)
	}
	res := user.ToResponse()
	return &res, nil
}

// DeleteUser schedules an administrator-requested account deletion.
func (s *UserService) DeleteUser(id uint) error {
	_, err := s.scheduleAccountDeletion(id, "", false)
	return err
}

// RequestAccountDeletion schedules deletion for the authenticated user after password confirmation.
func (s *UserService) RequestAccountDeletion(userID uint, password, confirmation string) (*models.AccountDeletionResponse, error) {
	if err := validateDeletionConfirmation(confirmation); err != nil {
		return nil, err
	}
	return s.scheduleAccountDeletion(userID, password, true)
}

// RequestAccountDeletionByCredentials provides the public web deletion path required by app stores.
func (s *UserService) RequestAccountDeletionByCredentials(email, password, confirmation string) (*models.AccountDeletionResponse, error) {
	if err := validateDeletionConfirmation(confirmation); err != nil {
		return nil, err
	}
	user, err := s.userRepo.FindByEmailInsensitive(strings.TrimSpace(email))
	if err != nil || bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)) != nil {
		return nil, errors.New("Invalid email or password")
	}
	return s.scheduleAccountDeletion(user.ID, password, true)
}

func validateDeletionConfirmation(value string) error {
	if strings.ToUpper(strings.TrimSpace(value)) != "DELETE" {
		return errors.New("Type DELETE to confirm account deletion")
	}
	return nil
}

func (s *UserService) scheduleAccountDeletion(userID uint, password string, verifyPassword bool) (*models.AccountDeletionResponse, error) {
	if userID == 0 {
		return nil, errors.New("user not found")
	}
	now := time.Now()
	scheduledFor := now.AddDate(0, 0, models.AccountDeletionRetentionDays)

	err := s.db.Transaction(func(tx *gorm.DB) error {
		var user models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
			return errors.New("user not found")
		}
		if verifyPassword && bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)) != nil {
			return errors.New("Invalid email or password")
		}
		if user.Role == "admin" {
			var otherAdmins int64
			if err := tx.Model(&models.User{}).Where("role = ? AND id <> ?", "admin", user.ID).Count(&otherAdmins).Error; err != nil {
				return err
			}
			if otherAdmins == 0 {
				return errors.New("The final administrator account cannot be deleted")
			}
		}

		if err := tx.Model(&models.UserSession{}).Where("user_id = ?", user.ID).Update("is_active", false).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.DeveloperKey{}).Where("user_id = ?", user.ID).Update("is_active", false).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.SMSJob{}).
			Where("user_id = ? AND status IN ?", user.ID, []string{"pending", "processing"}).
			Updates(map[string]interface{}{"status": "failed", "error_message": "Account deletion requested"}).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.SMSMessage{}).
			Where("user_id = ? AND status IN ?", user.ID, []string{models.SMSMessageStatusQueued, models.SMSMessageStatusProcessing}).
			Updates(map[string]interface{}{"status": models.SMSMessageStatusFailed, "error_message": "Account deletion requested"}).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.WhatsAppMessage{}).
			Where("user_id = ? AND status IN ?", user.ID, []string{models.WhatsAppMessageQueued, models.WhatsAppMessageSending}).
			Updates(map[string]interface{}{"status": models.WhatsAppMessageCancelled, "error": "Account deletion requested"}).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.UserSubscription{}).
			Where("user_id = ? AND status = ?", user.ID, models.SubscriptionActive).
			Update("status", models.SubscriptionCancelled).Error; err != nil {
			return err
		}

		if err := tx.Model(&user).Updates(map[string]interface{}{
			"account_status":                  models.AccountStatusDeletionPending,
			"deletion_requested_at":           now,
			"deletion_scheduled_for":          scheduledFor,
			"deletion_completed_at":           nil,
			"verification_token":              "",
			"verification_expires_at":         nil,
			"password_reset_token":            "",
			"password_reset_token_expires_at": nil,
		}).Error; err != nil {
			return err
		}
		return tx.Delete(&user).Error
	})
	if err != nil {
		return nil, err
	}

	if s.whatsapp != nil {
		go func() {
			if err := s.whatsapp.DeleteUserData(userID); err != nil {
				log.Printf("Account deletion: could not unlink WhatsApp data for user %d: %v", userID, err)
			}
		}()
	}

	return &models.AccountDeletionResponse{
		Message:       "Account deletion requested. Access has been revoked and personal data is scheduled for permanent deletion within 60 days.",
		RequestedAt:   now,
		ScheduledFor:  scheduledFor,
		RetentionDays: models.AccountDeletionRetentionDays,
	}, nil
}

// StartAccountDeletionPurge permanently erases due personal data and keeps only anonymized audit references.
func (s *UserService) StartAccountDeletionPurge(every time.Duration) {
	if every <= 0 {
		every = 6 * time.Hour
	}
	go func() {
		run := func() {
			if err := s.PurgeDueAccountData(time.Now()); err != nil {
				log.Printf("Account deletion purge failed: %v", err)
			}
		}
		run()
		ticker := time.NewTicker(every)
		defer ticker.Stop()
		for range ticker.C {
			run()
		}
	}()
}

// PurgeDueAccountData removes personal data for accounts whose 60-day retention window has ended.
func (s *UserService) PurgeDueAccountData(now time.Time) error {
	var users []models.User
	if err := s.db.Unscoped().
		Where("account_status = ? AND deletion_scheduled_for IS NOT NULL AND deletion_scheduled_for <= ?", models.AccountStatusDeletionPending, now).
		Find(&users).Error; err != nil {
		return err
	}
	for i := range users {
		if err := s.purgeAccountData(&users[i], now); err != nil {
			return fmt.Errorf("user %d: %w", users[i].ID, err)
		}
	}
	return nil
}

func (s *UserService) purgeAccountData(user *models.User, completedAt time.Time) error {
	for _, prefix := range []string{
		fmt.Sprintf("profile_images/%d_", user.ID),
		fmt.Sprintf("profile_images/%d/", user.ID),
		fmt.Sprintf("whatsapp-media/%d/", user.ID),
		fmt.Sprintf("ai-images/%d/", user.ID),
	} {
		if err := s.storageProvider.DeletePrefix(prefix); err != nil {
			return fmt.Errorf("delete stored files under %s: %w", prefix, err)
		}
	}
	urls, err := s.userStorageURLs(user)
	if err != nil {
		return err
	}
	for _, value := range urls {
		key := managedStorageKey(value)
		if key == "" {
			continue
		}
		if err := s.storageProvider.Delete(key); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("delete stored file %s: %w", key, err)
		}
	}
	if s.whatsapp != nil {
		if err := s.whatsapp.DeleteUserData(user.ID); err != nil {
			return err
		}
	}

	redactedPassword, err := bcrypt.GenerateFromPassword([]byte(uuid.NewString()), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		var contactIDs []uint
		if err := tx.Unscoped().Model(&models.Contact{}).Where("user_id = ?", user.ID).Pluck("id", &contactIDs).Error; err != nil {
			return err
		}
		if len(contactIDs) > 0 {
			if err := tx.Where("contact_id IN ?", contactIDs).Delete(&models.ContactGroupMember{}).Error; err != nil {
				return err
			}
		}
		for _, target := range []interface{}{
			&models.Contact{}, &models.ContactGroup{}, &models.Notification{}, &models.SMSTemplate{},
			&models.DeveloperKey{}, &models.AIConversation{}, &models.AuthCode{}, &models.AuthSMSCharge{},
			&models.DailyUsage{}, &models.UserSession{},
		} {
			if err := tx.Unscoped().Where("user_id = ?", user.ID).Delete(target).Error; err != nil {
				return err
			}
		}

		if err := tx.Model(&models.UserSecurityLog{}).Where("user_id = ?", user.ID).Updates(map[string]interface{}{
			"ip_address": "", "user_agent": "", "device": "", "location": "", "isp": "", "connection_ty": "", "country_flag": "",
		}).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.PaymentTransaction{}).Where("user_id = ?", user.ID).Updates(map[string]interface{}{
			"phone_number": "", "description": "", "raw_payload": "",
		}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Model(&models.SMSTopup{}).Where("user_id = ?", user.ID).Update("description", "").Error; err != nil {
			return err
		}
		if err := tx.Model(&models.SMSJob{}).Where("user_id = ?", user.ID).Updates(map[string]interface{}{
			"phone": "", "message": "[deleted]", "error_message": "",
		}).Error; err != nil {
			return err
		}

		var messageIDs []string
		if err := tx.Unscoped().Model(&models.SMSMessage{}).Where("user_id = ?", user.ID).Pluck("message_id", &messageIDs).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Model(&models.SMSMessage{}).Where("user_id = ?", user.ID).Updates(map[string]interface{}{
			"phone": "", "message": "[deleted]", "error_message": "", "raw_response": "",
		}).Error; err != nil {
			return err
		}
		if len(messageIDs) > 0 {
			if err := tx.Unscoped().Model(&models.SMSDeliveryLog{}).Where("message_id IN ?", messageIDs).Updates(map[string]interface{}{
				"phone": "", "raw_payload": "",
			}).Error; err != nil {
				return err
			}
		}
		if err := tx.Model(&models.WhatsAppMessage{}).Where("user_id = ?", user.ID).Updates(map[string]interface{}{
			"recipient": "", "body": "[deleted]", "image_url": "", "provider_message_id": "", "error": "",
		}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("user_id = ?", user.ID).Delete(&models.WhatsAppAccount{}).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.AdminSettings{}).Where("whatsapp_sender_user_id = ?", user.ID).Update("whatsapp_sender_user_id", 0).Error; err != nil {
			return err
		}

		return tx.Unscoped().Model(&models.User{}).Where("id = ?", user.ID).Updates(map[string]interface{}{
			"name":                            fmt.Sprintf("Deleted account #%d", user.ID),
			"email":                           fmt.Sprintf("deleted-%d@redacted.invalid", user.ID),
			"phone":                           "",
			"password":                        string(redactedPassword),
			"role":                            "user",
			"sms_balance":                     0,
			"whatsapp_balance":                0,
			"profile_image":                   "",
			"is_verified":                     false,
			"verification_token":              "",
			"verification_expires_at":         nil,
			"password_reset_token":            "",
			"password_reset_token_expires_at": nil,
			"account_status":                  models.AccountStatusAnonymized,
			"deletion_completed_at":           completedAt,
		}).Error
	})
}

func (s *UserService) userStorageURLs(user *models.User) ([]string, error) {
	unique := map[string]bool{}
	if user.ProfileImage != "" {
		unique[user.ProfileImage] = true
	}
	var media []string
	if err := s.db.Model(&models.WhatsAppMessage{}).Where("user_id = ? AND image_url <> ''", user.ID).Pluck("image_url", &media).Error; err != nil {
		return nil, err
	}
	for _, item := range media {
		unique[item] = true
	}
	var templates []models.SMSTemplate
	if err := s.db.Unscoped().Where("user_id = ? AND extras <> ''", user.ID).Find(&templates).Error; err != nil {
		return nil, err
	}
	for _, template := range templates {
		var rich models.WhatsAppRich
		if json.Unmarshal([]byte(template.Extras), &rich) == nil && rich.ImageURL != "" {
			unique[rich.ImageURL] = true
		}
	}
	result := make([]string, 0, len(unique))
	for item := range unique {
		result = append(result, item)
	}
	return result, nil
}

func managedStorageKey(value string) string {
	for _, marker := range []string{"profile_images/", "whatsapp-media/"} {
		if index := strings.Index(value, marker); index >= 0 {
			key := value[index:]
			if query := strings.IndexByte(key, '?'); query >= 0 {
				key = key[:query]
			}
			if decoded, err := url.PathUnescape(key); err == nil {
				return decoded
			}
			return key
		}
	}
	return ""
}

// UploadProfileImage uploads user's profile image using active storage provider.
func (s *UserService) UploadProfileImage(id uint, fileName string, content []byte, contentType string) (*models.UserResponse, error) {
	user, err := s.userRepo.FindByID(id)
	if err != nil {
		return nil, errors.New("user not found")
	}

	// Upload using the pluggable storage provider (local folder or AWS S3 / Cloudflare R2)
	url, err := s.storageProvider.Upload(fileName, content, contentType)
	if err != nil {
		return nil, fmt.Errorf("failed to upload profile image: %w", err)
	}

	user.ProfileImage = url
	if err := s.userRepo.Update(user); err != nil {
		return nil, fmt.Errorf("failed to save profile image: %w", err)
	}

	res := user.ToResponse()
	return &res, nil
}
