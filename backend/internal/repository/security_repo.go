package repository

import (
	"backend/internal/models"

	"gorm.io/gorm"
)

// SecurityRepository handles database operations for sessions and security logs.
type SecurityRepository struct {
	db *gorm.DB
}

// NewSecurityRepository creates a new SecurityRepository.
func NewSecurityRepository(db *gorm.DB) *SecurityRepository {
	return &SecurityRepository{db: db}
}

// CreateSession stores a new active session.
func (r *SecurityRepository) CreateSession(session *models.UserSession) error {
	return r.db.Create(session).Error
}

// FindSessionByTokenID finds an active session by token UUID.
func (r *SecurityRepository) FindSessionByTokenID(tokenID string) (*models.UserSession, error) {
	var session models.UserSession
	err := r.db.Where("token_id = ? AND is_active = ?", tokenID, true).First(&session).Error
	if err != nil {
		return nil, err
	}
	return &session, nil
}

// FindActiveSessionsByUserID returns all active sessions for a user.
func (r *SecurityRepository) FindActiveSessionsByUserID(userID uint) ([]models.UserSession, error) {
	var sessions []models.UserSession
	err := r.db.Where("user_id = ? AND is_active = ?", userID, true).Order("created_at DESC").Find(&sessions).Error
	return sessions, err
}

// RevokeSession sets a specific session as inactive.
func (r *SecurityRepository) RevokeSession(id uint, userID uint) error {
	return r.db.Model(&models.UserSession{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("is_active", false).Error
}

// RevokeAllOtherSessions revokes all active sessions for a user except the current one.
func (r *SecurityRepository) RevokeAllOtherSessions(userID uint, currentTokenID string) error {
	return r.db.Model(&models.UserSession{}).
		Where("user_id = ? AND token_id != ? AND is_active = ?", userID, currentTokenID, true).
		Update("is_active", false).Error
}

// CreateSecurityLog logs a new security event.
func (r *SecurityRepository) CreateSecurityLog(log *models.UserSecurityLog) error {
	return r.db.Create(log).Error
}

// FindSecurityLogsByUserID returns all security logs for a specific user.
func (r *SecurityRepository) FindSecurityLogsByUserID(userID uint) ([]models.UserSecurityLog, error) {
	var logs []models.UserSecurityLog
	err := r.db.Where("user_id = ?", userID).Order("created_at DESC").Find(&logs).Error
	return logs, err
}
