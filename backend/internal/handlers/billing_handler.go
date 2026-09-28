package handlers

import (
	"strconv"

	"backend/internal/models"
	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// BillingHandler handles plans, subscriptions and WhatsApp credit purchases.
type BillingHandler struct {
	billing  *services.BillingService
	payments *services.PaymentService
}

// NewBillingHandler creates a new BillingHandler.
func NewBillingHandler(billing *services.BillingService, payments *services.PaymentService) *BillingHandler {
	return &BillingHandler{billing: billing, payments: payments}
}

// ListPlans godoc
// @Summary      List Billing Plans
// @Description  Retrieve the active subscription plans
// @Tags         Billing
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.BillingPlan
// @Router       /billing/plans [get]
func (h *BillingHandler) ListPlans(c *fiber.Ctx) error {
	plans, err := h.billing.ListPlans(false)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, plans)
}

// GetSummary godoc
// @Summary      Get My Billing Summary
// @Description  Current plan, SMS and WhatsApp balances, and today's remaining free allowance
// @Tags         Billing
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  models.BillingSummary
// @Router       /billing/summary [get]
func (h *BillingHandler) GetSummary(c *fiber.Ctx) error {
	summary, err := h.billing.Summary(getUserID(c))
	if err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}
	return response.Success(c, summary)
}

// Subscribe godoc
// @Summary      Subscribe to a Plan
// @Description  Switch to the free plan immediately, or start a mobile money payment for a paid plan (activated when the payment completes)
// @Tags         Billing
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.SubscribeRequest  true  "Plan and payment details"
// @Success      200  {object}  models.SubscribeResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /billing/subscribe [post]
func (h *BillingHandler) Subscribe(c *fiber.Ctx) error {
	var req models.SubscribeRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	userID := getUserID(c)
	plan, err := h.billing.GetPlan(req.PlanID)
	if err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}

	if plan.Code == models.PlanCodeFree {
		summary, err := h.billing.SwitchToFree(userID)
		if err != nil {
			return response.Error(c, fiber.StatusBadRequest, err.Error())
		}
		return response.Success(c, models.SubscribeResponse{Activated: true, Summary: summary})
	}

	collection, err := h.payments.CreatePlanCollection(userID, plan, &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, models.SubscribeResponse{Collection: collection})
}

// BuyWhatsAppCredits godoc
// @Summary      Buy WhatsApp Credits
// @Description  Start a mobile money payment for WhatsApp credits at the price of the user's plan
// @Tags         Billing
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.BuyWhatsAppCreditsRequest  true  "Credits and payment details"
// @Success      200  {object}  models.CreateCollectionResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /billing/whatsapp-credits [post]
func (h *BillingHandler) BuyWhatsAppCredits(c *fiber.Ctx) error {
	var req models.BuyWhatsAppCreditsRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	collection, err := h.payments.CreateWhatsAppCollection(getUserID(c), &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, collection)
}

// AdminListPlans godoc
// @Summary      List All Plans (Admin)
// @Description  Retrieve every plan, including inactive ones
// @Tags         Billing
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.BillingPlan
// @Router       /billing/admin/plans [get]
func (h *BillingHandler) AdminListPlans(c *fiber.Ctx) error {
	plans, err := h.billing.ListPlans(true)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, plans)
}

// AdminCreatePlan godoc
// @Summary      Create Plan (Admin)
// @Tags         Billing
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.BillingPlanRequest  true  "Plan"
// @Success      201  {object}  models.BillingPlan
// @Failure      400  {object}  response.ErrorResponse
// @Router       /billing/admin/plans [post]
func (h *BillingHandler) AdminCreatePlan(c *fiber.Ctx) error {
	var req models.BillingPlanRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	plan, err := h.billing.CreatePlan(&req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Created(c, plan)
}

// AdminUpdatePlan godoc
// @Summary      Update Plan (Admin)
// @Description  Edit a plan's price, duration, SMS price, WhatsApp credits and free allowances
// @Tags         Billing
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                        true  "Plan ID"
// @Param        body  body  models.BillingPlanRequest  true  "Plan"
// @Success      200  {object}  models.BillingPlan
// @Failure      400  {object}  response.ErrorResponse
// @Router       /billing/admin/plans/{id} [put]
func (h *BillingHandler) AdminUpdatePlan(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid plan ID")
	}
	var req models.BillingPlanRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	plan, err := h.billing.UpdatePlan(uint(id), &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, plan)
}
