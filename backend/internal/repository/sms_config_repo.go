package repository

import (
	"errors"

	"backend/internal/models"

	"gorm.io/gorm"
)

// SMSConfigRepository interacts with the database for SMSConfig and SMSDeliveryLog entities.
type SMSConfigRepository struct {
	db *gorm.DB
}

// NewSMSConfigRepository instantiates a new SMSConfigRepository.
func NewSMSConfigRepository(db *gorm.DB) *SMSConfigRepository {
	return &SMSConfigRepository{db: db}
}

// Upsert creates or updates the singleton SMS configuration row.
// It always targets ID=1 so there is at most one active config.
func (r *SMSConfigRepository) Upsert(cfg *models.SMSConfig) error {
	cfg.ID = 1
	return r.db.Save(cfg).Error
}

// Get retrieves the current SMS configuration (ID=1).
func (r *SMSConfigRepository) Get() (*models.SMSConfig, error) {
	var cfg models.SMSConfig
	if err := r.db.First(&cfg, 1).Error; err != nil {
		return nil, err
	}
	return &cfg, nil
}

// CreateDeliveryLog inserts a new delivery status log entry.
func (r *SMSConfigRepository) CreateDeliveryLog(log *models.SMSDeliveryLog) error {
	return r.db.Create(log).Error
}

// FindDeliveryLogs retrieves delivery logs ordered by creation date.
func (r *SMSConfigRepository) FindDeliveryLogs(limit int) ([]models.SMSDeliveryLog, error) {
	var logs []models.SMSDeliveryLog
	q := r.db.Order("created_at desc")
	if limit > 0 {
		q = q.Limit(limit)
	}
	err := q.Find(&logs).Error
	return logs, err
}

// FindDeliveryLogsByMessageID retrieves delivery logs for a specific message.
func (r *SMSConfigRepository) FindDeliveryLogsByMessageID(messageID string) ([]models.SMSDeliveryLog, error) {
	var logs []models.SMSDeliveryLog
	err := r.db.Where("message_id = ?", messageID).Order("created_at desc").Find(&logs).Error
	return logs, err
}

// GetPricingRanges lists active SMS topup pricing ranges.
func (r *SMSConfigRepository) GetPricingRanges() ([]models.SMSPricingRange, error) {
	var ranges []models.SMSPricingRange
	err := r.db.Order("min_amount asc").Find(&ranges).Error
	return ranges, err
}

// ReplacePricingRanges atomically replaces all SMS topup pricing ranges.
func (r *SMSConfigRepository) ReplacePricingRanges(ranges []models.SMSPricingRange) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Unscoped().Where("1 = 1").Delete(&models.SMSPricingRange{}).Error; err != nil {
			return err
		}
		if len(ranges) == 0 {
			return errors.New("at least one pricing range is required")
		}
		return tx.Create(&ranges).Error
	})
}
