package handlers

import (
	"strconv"

	"backend/internal/models"
	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// SMSTemplateHandler handles HTTP requests for SMS template CRUD.
type SMSTemplateHandler struct {
	service *services.SMSTemplateService
}

// NewSMSTemplateHandler creates a new SMSTemplateHandler.
func NewSMSTemplateHandler(service *services.SMSTemplateService) *SMSTemplateHandler {
	return &SMSTemplateHandler{service: service}
}

// CreateTemplate godoc
// @Summary      Create SMS Template
// @Description  Create a new reusable SMS template with dynamic placeholders like {code}, {name}
// @Tags         SMS Templates
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.CreateSMSTemplateRequest  true  "Template details"
// @Success      201  {object}  models.SMSTemplateResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /sms-templates [post]
func (h *SMSTemplateHandler) CreateTemplate(c *fiber.Ctx) error {
	currentUserID := getUserID(c)

	var req models.CreateSMSTemplateRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	res, err := h.service.Create(currentUserID, &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}

	return response.Created(c, res)
}

// ListTemplates godoc
// @Summary      List My SMS Templates
// @Description  Retrieve all SMS templates belonging to the authenticated user
// @Tags         SMS Templates
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.SMSTemplateResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /sms-templates [get]
func (h *SMSTemplateHandler) ListTemplates(c *fiber.Ctx) error {
	currentUserID := getUserID(c)

	res, err := h.service.GetAllForUser(currentUserID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}

	return response.Success(c, res)
}

// GetTemplate godoc
// @Summary      Get SMS Template
// @Description  Retrieve a specific SMS template by ID
// @Tags         SMS Templates
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Template ID"
// @Success      200  {object}  models.SMSTemplateResponse
// @Failure      404  {object}  response.ErrorResponse
// @Router       /sms-templates/{id} [get]
func (h *SMSTemplateHandler) GetTemplate(c *fiber.Ctx) error {
	templateID, err := strconv.ParseUint(c.Params("id"), 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid Template ID format")
	}

	currentUserID := getUserID(c)
	isAdmin := c.Locals("role") == "admin"

	res, err := h.service.GetByID(uint(templateID), currentUserID, isAdmin)
	if err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}

	return response.Success(c, res)
}

// UpdateTemplate godoc
// @Summary      Update SMS Template
// @Description  Update an existing SMS template (name, category, body content)
// @Tags         SMS Templates
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                              true  "Template ID"
// @Param        body  body  models.UpdateSMSTemplateRequest  true  "Updated template fields"
// @Success      200  {object}  models.SMSTemplateResponse
// @Failure      400  {object}  response.ErrorResponse
// @Failure      404  {object}  response.ErrorResponse
// @Router       /sms-templates/{id} [put]
func (h *SMSTemplateHandler) UpdateTemplate(c *fiber.Ctx) error {
	templateID, err := strconv.ParseUint(c.Params("id"), 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid Template ID format")
	}

	var req models.UpdateSMSTemplateRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	currentUserID := getUserID(c)
	isAdmin := c.Locals("role") == "admin"

	res, err := h.service.Update(uint(templateID), currentUserID, isAdmin, &req)
	if err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}

	return response.Success(c, res)
}

// DeleteTemplate godoc
// @Summary      Delete SMS Template
// @Description  Soft-delete an SMS template
// @Tags         SMS Templates
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Template ID"
// @Success      200  {object}  response.SuccessResponse
// @Failure      404  {object}  response.ErrorResponse
// @Router       /sms-templates/{id} [delete]
func (h *SMSTemplateHandler) DeleteTemplate(c *fiber.Ctx) error {
	templateID, err := strconv.ParseUint(c.Params("id"), 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid Template ID format")
	}

	currentUserID := getUserID(c)
	isAdmin := c.Locals("role") == "admin"

	if err := h.service.Delete(uint(templateID), currentUserID, isAdmin); err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}

	return response.Success(c, fiber.Map{"message": "Template deleted successfully"})
}
