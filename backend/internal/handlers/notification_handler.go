package handlers

import (
	"strconv"

	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// NotificationHandler handles HTTP requests for notifications.
type NotificationHandler struct {
	service *services.NotificationService
}

// NewNotificationHandler creates a new NotificationHandler.
func NewNotificationHandler(service *services.NotificationService) *NotificationHandler {
	return &NotificationHandler{service: service}
}

// ListNotifications godoc
// @Summary      List Notifications
// @Description  Get all notifications for the authenticated user
// @Tags         Notifications
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.NotificationResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /notifications [get]
func (h *NotificationHandler) ListNotifications(c *fiber.Ctx) error {
	userID := getUserID(c)
	res, err := h.service.GetAllForUser(userID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, res)
}

// ListUnread godoc
// @Summary      List Unread Notifications
// @Description  Get only unread notifications for the authenticated user
// @Tags         Notifications
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.NotificationResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /notifications/unread [get]
func (h *NotificationHandler) ListUnread(c *fiber.Ctx) error {
	userID := getUserID(c)
	res, err := h.service.GetUnreadForUser(userID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, res)
}

// CountUnread godoc
// @Summary      Count Unread Notifications
// @Description  Get the count of unread notifications (for badge display)
// @Tags         Notifications
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  response.SuccessResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /notifications/unread/count [get]
func (h *NotificationHandler) CountUnread(c *fiber.Ctx) error {
	userID := getUserID(c)
	count, err := h.service.CountUnread(userID)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, fiber.Map{"count": count})
}

// MarkAsRead godoc
// @Summary      Mark Notification as Read
// @Description  Mark a single notification as read
// @Tags         Notifications
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Notification ID"
// @Success      200  {object}  response.SuccessResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /notifications/{id}/read [put]
func (h *NotificationHandler) MarkAsRead(c *fiber.Ctx) error {
	notifID, err := strconv.ParseUint(c.Params("id"), 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid Notification ID")
	}
	userID := getUserID(c)
	if err := h.service.MarkAsRead(uint(notifID), userID); err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, fiber.Map{"message": "Notification marked as read"})
}

// MarkAllAsRead godoc
// @Summary      Mark All Notifications as Read
// @Description  Mark all unread notifications as read for the authenticated user
// @Tags         Notifications
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  response.SuccessResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /notifications/read-all [put]
func (h *NotificationHandler) MarkAllAsRead(c *fiber.Ctx) error {
	userID := getUserID(c)
	if err := h.service.MarkAllAsRead(userID); err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, fiber.Map{"message": "All notifications marked as read"})
}
