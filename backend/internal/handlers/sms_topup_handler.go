package handlers

import (
	"strconv"

	"backend/internal/models"
	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// SMSTopupHandler handles HTTP requests for SMS top-up transactions.
type SMSTopupHandler struct {
	service *services.SMSTopupService
}

// NewSMSTopupHandler instantiates a new SMSTopupHandler.
func NewSMSTopupHandler(service *services.SMSTopupService) *SMSTopupHandler {
	return &SMSTopupHandler{service: service}
}

// PerformTopup godoc
// @Summary      Top-up User SMS Balance
// @Description  Add SMS credits to a user (Admin only)
// @Tags         SMS Topup
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                      true  "User ID"
// @Param        body  body  models.SMSTopupRequest   true  "Topup parameters"
// @Success      200  {object}  models.SMSTopupResponse
// @Failure      400  {object}  response.ErrorResponse
// @Failure      404  {object}  response.ErrorResponse
// @Router       /users/{id}/topup [post]
func (h *SMSTopupHandler) PerformTopup(c *fiber.Ctx) error {
	idParam := c.Params("id")
	userID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid User ID format")
	}

	var req models.SMSTopupRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	res, err := h.service.PerformTopup(uint(userID), &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}

	return response.Success(c, res)
}

// GetMyTopups godoc
// @Summary      Get My Topup History
// @Description  Get SMS credit top-up logs for the logged-in user
// @Tags         SMS Topup
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.SMSTopupResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /users/me/topups [get]
func (h *SMSTopupHandler) GetMyTopups(c *fiber.Ctx) error {
	currentUserID := getUserID(c)
	res, err := h.service.GetTopupsForUser(currentUserID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, res)
}

// GetUserTopups godoc
// @Summary      Get User Topup History
// @Description  Get SMS credit top-up logs for a specific user (Admin only)
// @Tags         SMS Topup
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "User ID"
// @Success      200  {array}  models.SMSTopupResponse
// @Failure      400  {object}  response.ErrorResponse
// @Failure      404  {object}  response.ErrorResponse
// @Router       /users/{id}/topups [get]
func (h *SMSTopupHandler) GetUserTopups(c *fiber.Ctx) error {
	idParam := c.Params("id")
	userID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid User ID format")
	}

	res, err := h.service.GetTopupsForUser(uint(userID))
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, res)
}

// ListAllTopups godoc
// @Summary      List All Topup Logs
// @Description  List all topup transactions in the system (Admin only)
// @Tags         SMS Topup
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.SMSTopupResponse
// @Failure      401  {object}  response.ErrorResponse
// @Failure      403  {object}  response.ErrorResponse
// @Router       /users/topups [get]
func (h *SMSTopupHandler) ListAllTopups(c *fiber.Ctx) error {
	res, err := h.service.GetAllTopups()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, res)
}
