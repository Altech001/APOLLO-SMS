package handlers

import (
	"strconv"

	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// SecurityHandler handles sessions and logs routing.
type SecurityHandler struct {
	service *services.SecurityService
}

// NewSecurityHandler creates a new SecurityHandler.
func NewSecurityHandler(service *services.SecurityService) *SecurityHandler {
	return &SecurityHandler{service: service}
}

// GetSessions godoc
// @Summary      Get Active Sessions
// @Description  Get list of all active sessions for the authenticated user
// @Tags         Security
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.SessionResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /security/sessions [get]
func (h *SecurityHandler) GetSessions(c *fiber.Ctx) error {
	userID := getUserID(c)
	currentSid := getSessionID(c)

	sessions, err := h.service.GetActiveSessions(userID, currentSid)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "Failed to retrieve sessions")
	}

	return response.Success(c, sessions)
}

// RevokeSession godoc
// @Summary      Revoke Session
// @Description  Revoke (log out) a specific active session by ID
// @Tags         Security
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Session ID"
// @Success      200  {object}  response.SuccessResponse
// @Failure      400  {object}  response.ErrorResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /security/sessions/{id} [delete]
func (h *SecurityHandler) RevokeSession(c *fiber.Ctx) error {
	userID := getUserID(c)
	
	idParam := c.Params("id")
	sessionID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid session ID format")
	}

	err = h.service.RevokeSession(uint(sessionID), userID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "Failed to revoke session")
	}

	return response.Success(c, fiber.Map{"message": "Session revoked successfully"})
}

// RevokeOtherSessions godoc
// @Summary      Revoke Other Sessions
// @Description  Revoke (log out) all other active sessions except the current one
// @Tags         Security
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  response.SuccessResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /security/sessions [delete]
func (h *SecurityHandler) RevokeOtherSessions(c *fiber.Ctx) error {
	userID := getUserID(c)
	currentSid := getSessionID(c)

	err := h.service.RevokeAllOtherSessions(userID, currentSid)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "Failed to revoke other sessions")
	}

	return response.Success(c, fiber.Map{"message": "All other sessions revoked successfully"})
}

// GetSecurityLogs godoc
// @Summary      Get Security Logs
// @Description  Get security event logs for the authenticated user
// @Tags         Security
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.SecurityLogResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /security/logs [get]
func (h *SecurityHandler) GetSecurityLogs(c *fiber.Ctx) error {
	userID := getUserID(c)

	logs, err := h.service.GetSecurityLogs(userID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "Failed to retrieve security logs")
	}

	return response.Success(c, logs)
}

// Helper: safe type assertion for UserID context locals
func getUserID(c *fiber.Ctx) uint {
	val := c.Locals("userId")
	switch v := val.(type) {
	case float64:
		return uint(v)
	case uint:
		return v
	case int:
		return uint(v)
	}
	return 0
}

// Helper: safe type assertion for SessionID context locals
func getSessionID(c *fiber.Ctx) string {
	val := c.Locals("sessionId")
	if s, ok := val.(string); ok {
		return s
	}
	return ""
}
