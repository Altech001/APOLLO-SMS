package handlers

import (
	"strconv"

	"backend/internal/models"
	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

type PaymentHandler struct {
	service *services.PaymentService
}

func NewPaymentHandler(service *services.PaymentService) *PaymentHandler {
	return &PaymentHandler{service: service}
}

func (h *PaymentHandler) CreateCollection(c *fiber.Ctx) error {
	var req models.CreateCollectionRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	res, err := h.service.CreateCollection(getUserID(c), &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Created(c, res)
}

func (h *PaymentHandler) GetCollection(c *fiber.Ctx) error {
	reference := c.Params("reference")
	res, err := h.service.GetByReference(reference)
	if err != nil {
		return response.Error(c, fiber.StatusNotFound, "payment transaction not found")
	}

	currentUserID := getUserID(c)
	role, _ := c.Locals("role").(string)
	if role != "admin" && (res.UserID == nil || *res.UserID != currentUserID) {
		return response.Error(c, fiber.StatusForbidden, "Access denied")
	}
	return response.Success(c, res)
}

func (h *PaymentHandler) MarzPayWebhook(c *fiber.Ctx) error {
	var payload models.MarzPayWebhookPayload
	if err := c.BodyParser(&payload); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid webhook payload")
	}

	if err := h.service.HandleMarzPayWebhook(&payload, c.Body()); err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, fiber.Map{"message": "MarzPay webhook received"})
}

func (h *PaymentHandler) CreateWithdrawal(c *fiber.Ctx) error {
	var req models.CreateWithdrawalRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	res, err := h.service.CreateWithdrawal(&req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Created(c, res)
}

func (h *PaymentHandler) ListTransactions(c *fiber.Ctx) error {
	limit := 100
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	res, err := h.service.List(limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, res)
}

func (h *PaymentHandler) UsageSummary(c *fiber.Ctx) error {
	res, err := h.service.UsageSummary()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, res)
}
