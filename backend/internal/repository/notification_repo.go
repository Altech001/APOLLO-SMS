package repository

import (
	"backend/internal/models"

	"gorm.io/gorm"
)

// NotificationRepository handles database operations for notifications.
type NotificationRepository struct {
	db *gorm.DB
}

// NewNotificationRepository creates a new NotificationRepository.
func NewNotificationRepository(db *gorm.DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

// Create inserts a new notification.
func (r *NotificationRepository) Create(notification *models.Notification) error {
	return r.db.Create(notification).Error
}

// FindByUserID retrieves all notifications for a user, newest first.
func (r *NotificationRepository) FindByUserID(userID uint) ([]models.Notification, error) {
	var notifications []models.Notification
	err := r.db.Where("user_id = ?", userID).Order("created_at desc").Find(&notifications).Error
	return notifications, err
}

// FindUnreadByUserID retrieves only unread notifications for a user.
func (r *NotificationRepository) FindUnreadByUserID(userID uint) ([]models.Notification, error) {
	var notifications []models.Notification
	err := r.db.Where("user_id = ? AND is_read = false", userID).Order("created_at desc").Find(&notifications).Error
	return notifications, err
}

// MarkAsRead marks a single notification as read.
func (r *NotificationRepository) MarkAsRead(id uint) error {
	return r.db.Model(&models.Notification{}).Where("id = ?", id).Update("is_read", true).Error
}

// MarkAllAsRead marks all notifications for a user as read.
func (r *NotificationRepository) MarkAllAsRead(userID uint) error {
	return r.db.Model(&models.Notification{}).Where("user_id = ? AND is_read = false", userID).Update("is_read", true).Error
}

// CountUnread returns the count of unread notifications for a user.
func (r *NotificationRepository) CountUnread(userID uint) (int64, error) {
	var count int64
	err := r.db.Model(&models.Notification{}).Where("user_id = ? AND is_read = false", userID).Count(&count).Error
	return count, err
}
