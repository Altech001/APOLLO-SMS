package repository

import (
	"backend/internal/models"

	"gorm.io/gorm"
)

// SMSTemplateRepository handles database operations for SMS templates.
type SMSTemplateRepository struct {
	db *gorm.DB
}

// NewSMSTemplateRepository creates a new SMSTemplateRepository.
func NewSMSTemplateRepository(db *gorm.DB) *SMSTemplateRepository {
	return &SMSTemplateRepository{db: db}
}

// Create inserts a new SMS template.
func (r *SMSTemplateRepository) Create(template *models.SMSTemplate) error {
	return r.db.Create(template).Error
}

// FindByID retrieves a single template by ID.
func (r *SMSTemplateRepository) FindByID(id uint) (*models.SMSTemplate, error) {
	var template models.SMSTemplate
	err := r.db.First(&template, id).Error
	return &template, err
}

// FindByUserID retrieves all templates belonging to a specific user.
func (r *SMSTemplateRepository) FindByUserID(userID uint) ([]models.SMSTemplate, error) {
	var templates []models.SMSTemplate
	err := r.db.Where("user_id = ?", userID).Order("updated_at desc").Find(&templates).Error
	return templates, err
}

// Update persists changes to an existing template.
func (r *SMSTemplateRepository) Update(template *models.SMSTemplate) error {
	return r.db.Save(template).Error
}

// Delete soft-deletes a template by ID.
func (r *SMSTemplateRepository) Delete(id uint) error {
	return r.db.Delete(&models.SMSTemplate{}, id).Error
}
