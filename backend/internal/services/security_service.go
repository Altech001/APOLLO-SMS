package services

import (
	"backend/internal/models"
	"backend/internal/repository"
)

// SecurityService handles session management and security logs.
type SecurityService struct {
	securityRepo *repository.SecurityRepository
}

// NewSecurityService creates a new SecurityService instance.
func NewSecurityService(securityRepo *repository.SecurityRepository) *SecurityService {
	return &SecurityService{securityRepo: securityRepo}
}

// GetActiveSessions lists all active sessions for a user, highlighting the current one.
func (s *SecurityService) GetActiveSessions(userID uint, currentTokenID string) ([]models.SessionResponse, error) {
	sessions, err := s.securityRepo.FindActiveSessionsByUserID(userID)
	if err != nil {
		return nil, err
	}

	response := make([]models.SessionResponse, 0, len(sessions))
	for _, sess := range sessions {
		response = append(response, models.SessionResponse{
			ID:           sess.ID,
			IPAddress:    sess.IPAddress,
			Device:       sess.Device,
			Location:     sess.Location,
			ISP:          sess.ISP,
			ConnectionTy: sess.ConnectionTy,
			CountryFlag:  sess.CountryFlag,
			IsCurrent:    sess.TokenID == currentTokenID,
			CreatedAt:    sess.CreatedAt,
			ExpiresAt:    sess.ExpiresAt,
		})
	}

	return response, nil
}

// RevokeSession revokes a specific session by ID.
func (s *SecurityService) RevokeSession(sessionID uint, userID uint) error {
	return s.securityRepo.RevokeSession(sessionID, userID)
}

// RevokeAllOtherSessions revokes all sessions except the current active session.
func (s *SecurityService) RevokeAllOtherSessions(userID uint, currentTokenID string) error {
	return s.securityRepo.RevokeAllOtherSessions(userID, currentTokenID)
}

// GetSecurityLogs returns the security logs for a user.
func (s *SecurityService) GetSecurityLogs(userID uint) ([]models.SecurityLogResponse, error) {
	logs, err := s.securityRepo.FindSecurityLogsByUserID(userID)
	if err != nil {
		return nil, err
	}

	response := make([]models.SecurityLogResponse, 0, len(logs))
	for _, l := range logs {
		response = append(response, models.SecurityLogResponse{
			ID:           l.ID,
			Action:       l.Action,
			IPAddress:    l.IPAddress,
			Device:       l.Device,
			Location:     l.Location,
			ISP:          l.ISP,
			ConnectionTy: l.ConnectionTy,
			CountryFlag:  l.CountryFlag,
			CreatedAt:    l.CreatedAt,
		})
	}

	return response, nil
}
