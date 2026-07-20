package handlers

import (
	"strconv"
	"strings"

	"backend/internal/models"
	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

type DeveloperKeyHandler struct {
	service *services.DeveloperKeyService
}

func NewDeveloperKeyHandler(service *services.DeveloperKeyService) *DeveloperKeyHandler {
	return &DeveloperKeyHandler{service: service}
}

// CreateKey godoc
// @Summary      Create Developer API Key
// @Description  Generate a new secure API key (shown only once)
// @Tags         Developer Keys
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.CreateDeveloperKeyRequest  true  "Key details"
// @Success      201  {object}  models.CreateDeveloperKeyResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /developer-keys [post]
func (h *DeveloperKeyHandler) CreateKey(c *fiber.Ctx) error {
	var req models.CreateDeveloperKeyRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	if req.Name == "" {
		return response.Error(c, fiber.StatusBadRequest, "Key name is required")
	}

	userID := getUserID(c)
	res, err := h.service.CreateKey(userID, &req)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}

	return response.Created(c, res)
}

// GetKeys godoc
// @Summary      List Developer API Keys
// @Description  List all registered developer API keys of the authenticated user
// @Tags         Developer Keys
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.DeveloperKey
// @Failure      401  {object}  response.ErrorResponse
// @Router       /developer-keys [get]
func (h *DeveloperKeyHandler) GetKeys(c *fiber.Ctx) error {
	userID := getUserID(c)
	keys, err := h.service.GetKeysForUser(userID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, keys)
}

// RevokeKey godoc
// @Summary      Revoke Developer API Key
// @Description  Delete/Revoke a developer API key by ID
// @Tags         Developer Keys
// @Security     BearerAuth
// @Param        id  path  int  true  "Key ID"
// @Success      200  {object}  response.SuccessResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /developer-keys/{id} [delete]
func (h *DeveloperKeyHandler) RevokeKey(c *fiber.Ctx) error {
	idParam := c.Params("id")
	keyID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid key ID format")
	}

	userID := getUserID(c)
	if err := h.service.RevokeKey(uint(keyID), userID); err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}

	return response.Success(c, fiber.Map{"message": "API key revoked successfully"})
}

// GatewaySendSMS godoc
// @Summary      Gateway Send SMS
// @Description  Send single or bulk SMS via developer API key header (Authorization: Bearer <Key> or X-API-Key)
// @Tags         Developer Gateway
// @Accept       json
// @Produce      json
// @Param        body  body  models.GatewaySendSMSRequest  true  "SMS payload"
// @Success      200   {object}  models.GatewaySendSMSResponse
// @Failure      401   {object}  response.ErrorResponse
// @Failure      400   {object}  response.ErrorResponse
// @Router       /gateway/send [post]
func (h *DeveloperKeyHandler) GatewaySendSMS(c *fiber.Ctx) error {
	// Extract key from header
	var rawKey string
	auth := c.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		rawKey = strings.TrimPrefix(auth, "Bearer ")
	} else {
		rawKey = c.Get("X-API-Key")
	}

	if rawKey == "" {
		return response.Error(c, fiber.StatusUnauthorized, "Missing Developer API Key")
	}

	// Validate developer key
	devKey, err := h.service.ValidateKey(rawKey)
	if err != nil {
		return response.Error(c, fiber.StatusUnauthorized, err.Error())
	}

	// Parse SMS request payload
	var req models.GatewaySendSMSRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	if req.Message == "" {
		return response.Error(c, fiber.StatusBadRequest, "message is required")
	}

	// Enqueue jobs in transaction
	res, err := h.service.EnqueueGatewaySMS(&devKey.User, &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}

	return response.Success(c, res)
}

// GetFailedJobs godoc
// @Summary      Get Failed SMS Jobs
// @Description  Retrieve failed background queue SMS messages (Admin only)
// @Tags         SMS Config
// @Security     BearerAuth
// @Produce      json
// @Param        limit  query  int  false  "Max jobs to return (default 100)"
// @Success      200    {array}  models.SMSJob
// @Failure      401    {object}  response.ErrorResponse
// @Failure      403    {object}  response.ErrorResponse
// @Router       /sms-config/failed-jobs [get]
func (h *DeveloperKeyHandler) GetFailedJobs(c *fiber.Ctx) error {
	limit := 100
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	jobs, err := h.service.GetFailedJobs(limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}

	return response.Success(c, jobs)
}
