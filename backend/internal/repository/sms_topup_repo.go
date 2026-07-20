package repository

import (
	"backend/internal/models"

	"gorm.io/gorm"
)

// SMSTopupRepository interacts with the postgres database for SMSTopup entities.
type SMSTopupRepository struct {
	db *gorm.DB
}

// NewSMSTopupRepository instantiates a new SMSTopupRepository.
func NewSMSTopupRepository(db *gorm.DB) *SMSTopupRepository {
	return &SMSTopupRepository{db: db}
}

// Create inserts a new SMSTopup record.
func (r *SMSTopupRepository) Create(topup *models.SMSTopup) error {
	return r.db.Create(topup).Error
}

// CreateWithTx inserts a new SMSTopup record using an active database transaction.
func (r *SMSTopupRepository) CreateWithTx(tx *gorm.DB, topup *models.SMSTopup) error {
	return tx.Create(topup).Error
}

// FindByUserID retrieves topups for a specific user.
func (r *SMSTopupRepository) FindByUserID(userID uint) ([]models.SMSTopup, error) {
	var topups []models.SMSTopup
	err := r.db.Where("user_id = ?", userID).Order("created_at desc").Find(&topups).Error
	return topups, err
}

// FindAll retrieves all topups in the system.
func (r *SMSTopupRepository) FindAll() ([]models.SMSTopup, error) {
	var topups []models.SMSTopup
	err := r.db.Order("created_at desc").Find(&topups).Error
	return topups, err
}
