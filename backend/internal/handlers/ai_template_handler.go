package handlers

import (
	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// AITemplateHandler handles AI-assisted template drafting.
type AITemplateHandler struct {
	service *services.AITemplateService
}

// NewAITemplateHandler creates a new AITemplateHandler.
func NewAITemplateHandler(service *services.AITemplateService) *AITemplateHandler {
	return &AITemplateHandler{service: service}
}

// GenerateTemplate godoc
// @Summary      Generate Template with AI
// @Description  Draft an SMS or WhatsApp template from a short description using NVIDIA NIM. The result is not saved.
// @Tags         SMS Templates
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  services.AITemplateRequest  true  "What the template should say"
// @Success      200  {object}  services.AITemplateResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /ai/templates/generate [post]
func (h *AITemplateHandler) GenerateTemplate(c *fiber.Ctx) error {
	var req services.AITemplateRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	res, err := h.service.Generate(&req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, res)
}
