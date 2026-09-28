package repository

import (
	"time"

	"backend/internal/models"

	"gorm.io/gorm"
)

// WhatsAppRepository handles database operations for WhatsApp accounts and messages.
type WhatsAppRepository struct {
	db *gorm.DB
}

// NewWhatsAppRepository creates a new WhatsAppRepository.
func NewWhatsAppRepository(db *gorm.DB) *WhatsAppRepository {
	return &WhatsAppRepository{db: db}
}

// CreateAccount inserts a new WhatsApp account.
func (r *WhatsAppRepository) CreateAccount(account *models.WhatsAppAccount) error {
	return r.db.Create(account).Error
}

// FindAccountByID retrieves a WhatsApp account by ID.
func (r *WhatsAppRepository) FindAccountByID(id uint) (*models.WhatsAppAccount, error) {
	var account models.WhatsAppAccount
	err := r.db.First(&account, id).Error
	return &account, err
}

// FindAccountsByUserID retrieves all WhatsApp accounts belonging to a user.
func (r *WhatsAppRepository) FindAccountsByUserID(userID uint) ([]models.WhatsAppAccount, error) {
	var accounts []models.WhatsAppAccount
	err := r.db.Where("user_id = ?", userID).Order("created_at desc").Find(&accounts).Error
	return accounts, err
}

// CountAccountsByUserID counts the WhatsApp accounts a user has.
func (r *WhatsAppRepository) CountAccountsByUserID(userID uint) (int64, error) {
	var count int64
	err := r.db.Model(&models.WhatsAppAccount{}).Where("user_id = ?", userID).Count(&count).Error
	return count, err
}

// FindRestorableAccounts returns linked whatsmeow accounts whose sessions should be reconnected on startup.
func (r *WhatsAppRepository) FindRestorableAccounts() ([]models.WhatsAppAccount, error) {
	var accounts []models.WhatsAppAccount
	err := r.db.Where("provider = ? AND device_jid <> '' AND status <> ?", models.WhatsAppProviderWhatsmeow, models.WhatsAppStatusLoggedOut).
		Order("id asc").Find(&accounts).Error
	return accounts, err
}

// UpdateAccountFields updates selected columns of an account without overwriting concurrent changes.
func (r *WhatsAppRepository) UpdateAccountFields(id uint, fields map[string]interface{}) error {
	return r.db.Model(&models.WhatsAppAccount{}).Where("id = ?", id).Updates(fields).Error
}

// UpdateAccountFieldsIfStatus updates an account only while it is in the given status.
func (r *WhatsAppRepository) UpdateAccountFieldsIfStatus(id uint, status string, fields map[string]interface{}) error {
	return r.db.Model(&models.WhatsAppAccount{}).Where("id = ? AND status = ?", id, status).Updates(fields).Error
}

// DeleteAccount soft-deletes a WhatsApp account by ID.
func (r *WhatsAppRepository) DeleteAccount(id uint) error {
	return r.db.Delete(&models.WhatsAppAccount{}, id).Error
}

// CreateMessages inserts a batch of WhatsApp message records.
func (r *WhatsAppRepository) CreateMessages(messages []models.WhatsAppMessage) error {
	if len(messages) == 0 {
		return nil
	}
	return r.db.Create(&messages).Error
}

// FindMessagesByUserID retrieves the most recent WhatsApp messages for a user.
func (r *WhatsAppRepository) FindMessagesByUserID(userID uint, limit int) ([]models.WhatsAppMessage, error) {
	var messages []models.WhatsAppMessage
	err := r.db.Where("user_id = ?", userID).Order("created_at desc, id desc").Limit(limit).Find(&messages).Error
	return messages, err
}

// ClaimNextQueued atomically moves the oldest queued message of an account to "sending" and returns it,
// or nil when the queue is empty. SKIP LOCKED guarantees two workers never claim the same message.
func (r *WhatsAppRepository) ClaimNextQueued(accountID uint) (*models.WhatsAppMessage, error) {
	var messages []models.WhatsAppMessage
	err := r.db.Raw(`UPDATE whats_app_messages SET status = ?
		WHERE id = (
			SELECT id FROM whats_app_messages
			WHERE account_id = ? AND status = ?
			ORDER BY id LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
		RETURNING *`, models.WhatsAppMessageSending, accountID, models.WhatsAppMessageQueued).Scan(&messages).Error
	if err != nil || len(messages) == 0 {
		return nil, err
	}
	return &messages[0], nil
}

// UpdateMessageFields updates selected columns of a message.
func (r *WhatsAppRepository) UpdateMessageFields(id uint, fields map[string]interface{}) error {
	return r.db.Model(&models.WhatsAppMessage{}).Where("id = ?", id).Updates(fields).Error
}

// CountSentSince counts messages an account has sent since the given time.
func (r *WhatsAppRepository) CountSentSince(accountID uint, since time.Time) (int64, error) {
	var count int64
	err := r.db.Model(&models.WhatsAppMessage{}).
		Where("account_id = ? AND status = ? AND sent_at >= ?", accountID, models.WhatsAppMessageSent, since).
		Count(&count).Error
	return count, err
}

// CountQueued counts messages waiting to be sent for an account.
func (r *WhatsAppRepository) CountQueued(accountID uint) (int64, error) {
	var count int64
	err := r.db.Model(&models.WhatsAppMessage{}).
		Where("account_id = ? AND status = ?", accountID, models.WhatsAppMessageQueued).
		Count(&count).Error
	return count, err
}

// FailMessagesWithStatus marks every message in the given status as failed, optionally scoped to one account.
func (r *WhatsAppRepository) FailMessagesWithStatus(accountID uint, status, reason string) error {
	query := r.db.Model(&models.WhatsAppMessage{}).Where("status = ?", status)
	if accountID != 0 {
		query = query.Where("account_id = ?", accountID)
	}
	return query.Updates(map[string]interface{}{"status": models.WhatsAppMessageFailed, "error": reason}).Error
}
