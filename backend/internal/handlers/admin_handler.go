package handlers

import (
	"time"

	"backend/internal/models"
	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// AdminHandler serves the admin profit report, provider balances and alert settings.
type AdminHandler struct {
	service *services.AdminService
}

// NewAdminHandler creates an AdminHandler.
func NewAdminHandler(service *services.AdminService) *AdminHandler {
	return &AdminHandler{service: service}
}

// Profit godoc
// @Summary      Profit report
// @Description  Revenue, SMS provider cost and profit for a period: today, 7d, 30d, 90d, year or all (Admin only)
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Param        range  query  string  false  "today | 7d | 30d | 90d | year | all"
// @Success      200  {object}  models.ProfitSummary
// @Router       /admin/profit [get]
func (h *AdminHandler) Profit(c *fiber.Ctx) error {
	now := time.Now()
	midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var from *time.Time
	chartDays := 30
	switch c.Query("range", "30d") {
	case "today":
		from = &midnight
		chartDays = 7
	case "7d":
		t := midnight.AddDate(0, 0, -6)
		from, chartDays = &t, 7
	case "90d":
		t := midnight.AddDate(0, 0, -89)
		from, chartDays = &t, 90
	case "year":
		t := midnight.AddDate(-1, 0, 1)
		from, chartDays = &t, 90
	case "all":
	default:
		t := midnight.AddDate(0, 0, -29)
		from = &t
	}

	res, err := h.service.Profit(from, chartDays)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, res)
}

// ProviderBalances godoc
// @Summary      SMS provider balances
// @Description  Live JulySMS and Africa's Talking balances with the alert thresholds (Admin only)
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.ProviderBalance
// @Router       /admin/provider-balances [get]
func (h *AdminHandler) ProviderBalances(c *fiber.Ctx) error {
	res, err := h.service.ProviderBalances()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, res)
}

// GetSettings godoc
// @Summary      Admin alert and cost settings
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  models.AdminSettings
// @Router       /admin/settings [get]
func (h *AdminHandler) GetSettings(c *fiber.Ctx) error {
	res, err := h.service.Settings()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, res)
}

// SaveSettings godoc
// @Summary      Save admin alert and cost settings
// @Tags         Admin
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.AdminSettingsRequest  true  "Settings"
// @Success      200  {object}  models.AdminSettings
// @Router       /admin/settings [put]
func (h *AdminHandler) SaveSettings(c *fiber.Ctx) error {
	var req models.AdminSettingsRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	res, err := h.service.SaveSettings(getUserID(c), &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, res)
}

// TestAlert godoc
// @Summary      Send a test admin alert
// @Description  Sends a test message on every enabled channel and reports failures (Admin only)
// @Tags         Admin
// @Security     BearerAuth
// @Produce      json
// @Router       /admin/settings/test-alert [post]
func (h *AdminHandler) TestAlert(c *fiber.Ctx) error {
	problems := h.service.SendAlert("Test alert", "Your admin alerts are working.")
	return response.Success(c, fiber.Map{"problems": problems})
}
