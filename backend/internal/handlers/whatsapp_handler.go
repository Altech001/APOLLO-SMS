package handlers

import (
	"errors"
	"strconv"

	"backend/internal/models"
	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// WhatsAppHandler handles HTTP requests for linking WhatsApp numbers and sending messages.
type WhatsAppHandler struct {
	service *services.WhatsAppService
}

// NewWhatsAppHandler creates a new WhatsAppHandler.
func NewWhatsAppHandler(service *services.WhatsAppService) *WhatsAppHandler {
	return &WhatsAppHandler{service: service}
}

func parseWhatsAppAccountID(c *fiber.Ctx) (uint, error) {
	id, err := strconv.ParseUint(c.Params("id"), 10, 32)
	return uint(id), err
}

// ConnectAccount godoc
// @Summary      Link WhatsApp Number
// @Description  Start linking a WhatsApp number as a linked device ("whatsmeow"). Returns a QR code to scan, plus a pairing code when phone_number is given. Use provider "sandbox" for simulated sending.
// @Tags         WhatsApp
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.ConnectWhatsAppRequest  true  "WhatsApp account details"
// @Success      201  {object}  models.WhatsAppPairingResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /whatsapp/accounts [post]
func (h *WhatsAppHandler) ConnectAccount(c *fiber.Ctx) error {
	var req models.ConnectWhatsAppRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	res, err := h.service.Connect(getUserID(c), &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}

	return response.Created(c, res)
}

// ListAccounts godoc
// @Summary      List My WhatsApp Numbers
// @Description  Retrieve all WhatsApp numbers linked by the authenticated user, with online state and sending limits
// @Tags         WhatsApp
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.WhatsAppAccountResponse
// @Router       /whatsapp/accounts [get]
func (h *WhatsAppHandler) ListAccounts(c *fiber.Ctx) error {
	res, err := h.service.ListAccounts(getUserID(c))
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}

	return response.Success(c, res)
}

// GetPairing godoc
// @Summary      Get Linking Progress
// @Description  Poll the current QR code / pairing code and linking status for a WhatsApp number
// @Tags         WhatsApp
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "WhatsApp account ID"
// @Success      200  {object}  models.WhatsAppPairingResponse
// @Failure      404  {object}  response.ErrorResponse
// @Router       /whatsapp/accounts/{id}/pairing [get]
func (h *WhatsAppHandler) GetPairing(c *fiber.Ctx) error {
	accountID, err := parseWhatsAppAccountID(c)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid account ID format")
	}

	res, err := h.service.PairingStatus(accountID, getUserID(c))
	if err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}

	return response.Success(c, res)
}

// PairAccount godoc
// @Summary      Link WhatsApp Number Again
// @Description  Restart linking for an existing number (after logout or an expired QR code)
// @Tags         WhatsApp
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                         true   "WhatsApp account ID"
// @Param        body  body  models.PairWhatsAppRequest  false  "Optional phone number for a pairing code"
// @Success      200  {object}  models.WhatsAppPairingResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /whatsapp/accounts/{id}/pair [post]
func (h *WhatsAppHandler) PairAccount(c *fiber.Ctx) error {
	accountID, err := parseWhatsAppAccountID(c)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid account ID format")
	}

	var req models.PairWhatsAppRequest
	if len(c.Body()) > 0 {
		if err := c.BodyParser(&req); err != nil {
			return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
		}
	}

	res, err := h.service.Pair(accountID, getUserID(c), &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}

	return response.Success(c, res)
}

// ReconnectAccount godoc
// @Summary      Reconnect WhatsApp Number
// @Description  Reopen the session of a linked number that went offline
// @Tags         WhatsApp
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "WhatsApp account ID"
// @Success      200  {object}  models.WhatsAppAccountResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /whatsapp/accounts/{id}/reconnect [post]
func (h *WhatsAppHandler) ReconnectAccount(c *fiber.Ctx) error {
	accountID, err := parseWhatsAppAccountID(c)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid account ID format")
	}

	res, err := h.service.Reconnect(accountID, getUserID(c))
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}

	return response.Success(c, res)
}

// DisconnectAccount godoc
// @Summary      Disconnect WhatsApp Number
// @Description  Log the linked device out of WhatsApp, delete its session and remove the number
// @Tags         WhatsApp
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "WhatsApp account ID"
// @Success      200  {object}  response.SuccessResponse
// @Failure      404  {object}  response.ErrorResponse
// @Router       /whatsapp/accounts/{id} [delete]
func (h *WhatsAppHandler) DisconnectAccount(c *fiber.Ctx) error {
	accountID, err := parseWhatsAppAccountID(c)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid account ID format")
	}

	if err := h.service.Disconnect(accountID, getUserID(c)); err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}

	return response.Success(c, fiber.Map{"message": "WhatsApp number disconnected successfully"})
}

// SendMessage godoc
// @Summary      Send WhatsApp Message
// @Description  Queue a text message to one or more recipients. Messages are sent gradually from the linked number.
// @Tags         WhatsApp
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.SendWhatsAppRequest  true  "Message details"
// @Success      200  {object}  models.SendWhatsAppResponse
// @Failure      400  {object}  response.ErrorResponse
// @Failure      402  {object}  response.ErrorResponse  "Not enough WhatsApp credits"
// @Router       /whatsapp/send [post]
func (h *WhatsAppHandler) SendMessage(c *fiber.Ctx) error {
	var req models.SendWhatsAppRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	res, err := h.service.Send(getUserID(c), &req)
	if errors.Is(err, services.ErrWhatsAppPaymentRequired) {
		return response.Error(c, fiber.StatusPaymentRequired, err.Error())
	}
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}

	return response.Success(c, res)
}

// ListGroups godoc
// @Summary      List WhatsApp Groups
// @Description  List the groups a linked number belongs to, with members' phone numbers (members WhatsApp keeps private are only counted). Served from cache unless refresh=true; forced refreshes are throttled per number.
// @Tags         WhatsApp
// @Security     BearerAuth
// @Produce      json
// @Param        id       path   int   true   "WhatsApp account ID"
// @Param        refresh  query  bool  false  "Reload from WhatsApp instead of the cache"
// @Success      200  {object}  models.WhatsAppGroupsResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /whatsapp/accounts/{id}/groups [get]
func (h *WhatsAppHandler) ListGroups(c *fiber.Ctx) error {
	accountID, err := parseWhatsAppAccountID(c)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid account ID format")
	}
	groups, err := h.service.ListGroups(accountID, getUserID(c), c.QueryBool("refresh"))
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, groups)
}

// CancelMessage godoc
// @Summary      Cancel Queued WhatsApp Message
// @Description  Cancel a message that is still queued and refund its WhatsApp credit or free allowance
// @Tags         WhatsApp
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Message ID"
// @Success      200  {object}  response.SuccessResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /whatsapp/messages/{id} [delete]
func (h *WhatsAppHandler) CancelMessage(c *fiber.Ctx) error {
	messageID, err := strconv.ParseUint(c.Params("id"), 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid message ID")
	}
	if err := h.service.CancelMessage(getUserID(c), uint(messageID)); err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, fiber.Map{"message": "WhatsApp message cancelled and refunded"})
}

// ListMessages godoc
// @Summary      List WhatsApp Messages
// @Description  Retrieve recent WhatsApp messages (queued, sent and failed) for the authenticated user
// @Tags         WhatsApp
// @Security     BearerAuth
// @Produce      json
// @Param        limit  query  int  false  "Max records (default 100)"
// @Success      200  {array}  models.WhatsAppMessage
// @Router       /whatsapp/messages [get]
func (h *WhatsAppHandler) ListMessages(c *fiber.Ctx) error {
	res, err := h.service.ListMessages(getUserID(c), c.QueryInt("limit", 100))
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}

	return response.Success(c, res)
}
