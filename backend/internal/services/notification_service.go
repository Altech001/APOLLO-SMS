package services

import (
	"fmt"

	"backend/internal/models"
	"backend/internal/repository"
)

// NotificationService handles notification business logic and acts as a system-wide activity recorder.
type NotificationService struct {
	notifRepo *repository.NotificationRepository
}

// NewNotificationService creates a new NotificationService.
func NewNotificationService(notifRepo *repository.NotificationRepository) *NotificationService {
	return &NotificationService{notifRepo: notifRepo}
}

// Notify creates a new notification for a user (used by other services to record activities).
func (s *NotificationService) Notify(userID uint, title, message, notifType string) {
	notif := &models.Notification{
		UserID:  userID,
		Title:   title,
		Message: message,
		Type:    notifType,
	}
	// Fire-and-forget: log error but don't block the caller
	if err := s.notifRepo.Create(notif); err != nil {
		fmt.Printf("⚠️  Failed to create notification for user %d: %v\n", userID, err)
	}
}

// GetAllForUser retrieves all notifications for a user.
func (s *NotificationService) GetAllForUser(userID uint) ([]models.NotificationResponse, error) {
	notifications, err := s.notifRepo.FindByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve notifications: %w", err)
	}

	res := make([]models.NotificationResponse, len(notifications))
	for i, n := range notifications {
		res[i] = n.ToResponse()
	}
	return res, nil
}

// GetUnreadForUser retrieves only unread notifications.
func (s *NotificationService) GetUnreadForUser(userID uint) ([]models.NotificationResponse, error) {
	notifications, err := s.notifRepo.FindUnreadByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve unread notifications: %w", err)
	}

	res := make([]models.NotificationResponse, len(notifications))
	for i, n := range notifications {
		res[i] = n.ToResponse()
	}
	return res, nil
}

// MarkAsRead marks a single notification as read.
func (s *NotificationService) MarkAsRead(notifID, userID uint) error {
	return s.notifRepo.MarkAsRead(notifID)
}

// MarkAllAsRead marks all notifications as read for a user.
func (s *NotificationService) MarkAllAsRead(userID uint) error {
	return s.notifRepo.MarkAllAsRead(userID)
}

// CountUnread returns the unread notification count.
func (s *NotificationService) CountUnread(userID uint) (int64, error) {
	return s.notifRepo.CountUnread(userID)
}
