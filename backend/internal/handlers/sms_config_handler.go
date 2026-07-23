package handlers

import (
	"strconv"

	"backend/internal/models"
	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// SMSConfigHandler handles HTTP requests for SMS provider configuration.
type SMSConfigHandler struct {
	service      *services.SMSConfigService
	queueService *services.DeveloperKeyService
}

// NewSMSConfigHandler creates a new SMSConfigHandler instance.
func NewSMSConfigHandler(service *services.SMSConfigService, queueService *services.DeveloperKeyService) *SMSConfigHandler {
	return &SMSConfigHandler{service: service, queueService: queueService}
}

// GetConfig godoc
// @Summary      Get SMS Provider Configuration
// @Description  Retrieve current SMS gateway settings (Admin only). Secrets are masked.
// @Tags         SMS Config
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  models.SMSConfigResponse
// @Failure      401  {object}  response.ErrorResponse
// @Failure      403  {object}  response.ErrorResponse
// @Router       /sms-config [get]
func (h *SMSConfigHandler) GetConfig(c *fiber.Ctx) error {
	cfg, err := h.service.GetConfig()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, cfg)
}

// SaveConfig godoc
// @Summary      Save SMS Provider Configuration
// @Description  Create or update SMS gateway settings (Admin only)
// @Tags         SMS Config
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.SMSConfigRequest  true  "SMS config parameters"
// @Success      200   {object}  models.SMSConfigResponse
// @Failure      400   {object}  response.ErrorResponse
// @Failure      401   {object}  response.ErrorResponse
// @Failure      403   {object}  response.ErrorResponse
// @Router       /sms-config [put]
func (h *SMSConfigHandler) SaveConfig(c *fiber.Ctx) error {
	var req models.SMSConfigRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	// Validate required fields
	if req.ActiveProvider == "" {
		return response.Error(c, fiber.StatusBadRequest, "active_provider is required")
	}
	if req.CostPerSegment <= 0 {
		return response.Error(c, fiber.StatusBadRequest, "cost_per_segment must be greater than zero")
	}
	if req.QueueBatchSize <= 0 {
		return response.Error(c, fiber.StatusBadRequest, "queue_batch_size must be greater than zero")
	}

	adminUserID := getUserID(c)
	cfg, err := h.service.SaveConfig(&req, adminUserID)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}

	return response.Success(c, cfg)
}

// GetPublicPricing godoc
// @Summary      Get public SMS pricing
// @Description  Retrieve the per-segment SMS rate for authenticated users
// @Tags         SMS Config
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  models.SMSPublicPricingResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /sms-pricing [get]
func (h *SMSConfigHandler) GetPublicPricing(c *fiber.Ctx) error {
	pricing, err := h.service.GetPublicPricing()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, pricing)
}

// GetPricingRanges godoc
// @Summary      Get SMS Pricing Ranges
// @Description  Retrieve topup pricing bands (Admin only)
// @Tags         SMS Config
// @Security     BearerAuth
// @Produce      json
// @Success      200   {array}  models.SMSPricingRangeResponse
// @Router       /sms-config/pricing-ranges [get]
func (h *SMSConfigHandler) GetPricingRanges(c *fiber.Ctx) error {
	ranges, err := h.service.GetPricingRanges()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, ranges)
}

// SavePricingRanges godoc
// @Summary      Save SMS Pricing Ranges
// @Description  Replace topup pricing bands (Admin only)
// @Tags         SMS Config
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  []models.SMSPricingRangeRequest  true  "Pricing ranges"
// @Success      200   {array}  models.SMSPricingRangeResponse
// @Router       /sms-config/pricing-ranges [put]
func (h *SMSConfigHandler) SavePricingRanges(c *fiber.Ctx) error {
	var req []models.SMSPricingRangeRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	adminUserID := getUserID(c)
	ranges, err := h.service.SavePricingRanges(req, adminUserID)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, ranges)
}

// SendSMS godoc
// @Summary      Send SMS
// @Description  Queue SMS for the authenticated user, deduct SMS balance, and send through the active provider
// @Tags         SMS Config
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.SendSMSRequest  true  "SMS parameters"
// @Success      200   {object}  models.GatewaySendSMSResponse
// @Failure      400   {object}  response.ErrorResponse
// @Failure      401   {object}  response.ErrorResponse
// @Router       /sms-config/send [post]
func (h *SMSConfigHandler) SendSMS(c *fiber.Ctx) error {
	var req models.SendSMSRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	if req.Message == "" {
		return response.Error(c, fiber.StatusBadRequest, "message is required")
	}
	if req.Phone == "" && len(req.Phones) == 0 {
		return response.Error(c, fiber.StatusBadRequest, "at least one phone number is required")
	}

	userID := getUserID(c)
	res, err := h.queueService.EnqueueGatewaySMS(&models.User{ID: userID}, &models.GatewaySendSMSRequest{
		Phone:   req.Phone,
		Phones:  req.Phones,
		Message: req.Message,
	})
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}

	return response.Success(c, res)
}

// CheckBalance godoc
// @Summary      Check JulySMS Balance
// @Description  Query the JulySMS gateway for current SMS credit balance (Admin only)
// @Tags         SMS Config
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  models.SMSBalanceResponse
// @Failure      400  {object}  response.ErrorResponse
// @Failure      401  {object}  response.ErrorResponse
// @Failure      403  {object}  response.ErrorResponse
// @Router       /sms-config/balance [get]
func (h *SMSConfigHandler) CheckBalance(c *fiber.Ctx) error {
	bal, err := h.service.CheckJulySMSBalance()
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, bal)
}

// JulySMSWebhook godoc
// @Summary      JulySMS Delivery Webhook
// @Description  Receives delivery status updates from JulySMS. Verifies HMAC-SHA256 signature.
// @Tags         SMS Config
// @Accept       json
// @Produce      json
// @Success      200  {object}  response.SuccessResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /sms-config/webhooks/julysms [post]
func (h *SMSConfigHandler) JulySMSWebhook(c *fiber.Ctx) error {
	// Read raw body for signature verification
	rawBody := c.Body()
	signature := c.Get("X-Signature")

	if signature == "" {
		return response.Error(c, fiber.StatusUnauthorized, "Missing X-Signature header")
	}

	// Verify HMAC signature
	valid, err := h.service.VerifyJulySMSWebhook(signature, rawBody)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	if !valid {
		return response.Error(c, fiber.StatusUnauthorized, "Invalid webhook signature")
	}

	// Parse delivery status
	var status models.JulySMSDeliveryStatus
	if err := c.BodyParser(&status); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid webhook payload")
	}

	// Log the delivery status
	if err := h.service.HandleJulySMSWebhook(&status, string(rawBody)); err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "Failed to log delivery status")
	}

	return response.Success(c, fiber.Map{"message": "Delivery status received"})
}

// GetDeliveryLogs godoc
// @Summary      Get SMS Delivery Logs
// @Description  Retrieve recent SMS delivery status logs (Admin only)
// @Tags         SMS Config
// @Security     BearerAuth
// @Produce      json
// @Param        limit  query  int  false  "Max logs to return (default 100)"
// @Success      200    {array}  models.SMSDeliveryLog
// @Failure      401    {object}  response.ErrorResponse
// @Failure      403    {object}  response.ErrorResponse
// @Router       /sms-config/delivery-logs [get]
func (h *SMSConfigHandler) GetDeliveryLogs(c *fiber.Ctx) error {
	limit := 100
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	logs, err := h.service.GetDeliveryLogs(limit)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}

	return response.Success(c, logs)
}
