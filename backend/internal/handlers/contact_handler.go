package handlers

import (
	"strconv"

	"backend/internal/models"
	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// ContactHandler handles contact and contact group CRUD.
type ContactHandler struct {
	service *services.ContactService
}

// NewContactHandler creates a new ContactHandler.
func NewContactHandler(service *services.ContactService) *ContactHandler {
	return &ContactHandler{service: service}
}

func parseIDParam(c *fiber.Ctx) (uint, error) {
	id, err := strconv.ParseUint(c.Params("id"), 10, 32)
	return uint(id), err
}

// ListContacts godoc
// @Summary      List Contacts
// @Tags         Contacts
// @Security     BearerAuth
// @Produce      json
// @Param        search    query  string  false  "Name, phone or email"
// @Param        group_id  query  int     false  "Only contacts in this group"
// @Param        limit     query  int     false  "Max results (default 500, max 5000)"
// @Param        offset    query  int     false  "Offset"
// @Success      200  {object}  models.ContactListResponse
// @Router       /contacts [get]
func (h *ContactHandler) ListContacts(c *fiber.Ctx) error {
	res, err := h.service.ListContacts(getUserID(c), c.Query("search"), uint(c.QueryInt("group_id", 0)), c.QueryInt("limit", 0), c.QueryInt("offset", 0))
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, res)
}

// CreateContact godoc
// @Summary      Create Contact
// @Tags         Contacts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.ContactRequest  true  "Contact"
// @Success      201  {object}  models.ContactResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /contacts [post]
func (h *ContactHandler) CreateContact(c *fiber.Ctx) error {
	var req models.ContactRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	res, err := h.service.CreateContact(getUserID(c), &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Created(c, res)
}

// UpdateContact godoc
// @Summary      Update Contact
// @Description  Edit a contact. When group_ids is sent it replaces the contact's groups.
// @Tags         Contacts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                    true  "Contact ID"
// @Param        body  body  models.ContactRequest  true  "Contact"
// @Success      200  {object}  models.ContactResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /contacts/{id} [put]
func (h *ContactHandler) UpdateContact(c *fiber.Ctx) error {
	id, err := parseIDParam(c)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid contact ID")
	}
	var req models.ContactRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	res, err := h.service.UpdateContact(getUserID(c), id, &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, res)
}

// DeleteContact godoc
// @Summary      Delete Contact
// @Tags         Contacts
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Contact ID"
// @Success      200  {object}  response.SuccessResponse
// @Failure      404  {object}  response.ErrorResponse
// @Router       /contacts/{id} [delete]
func (h *ContactHandler) DeleteContact(c *fiber.Ctx) error {
	id, err := parseIDParam(c)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid contact ID")
	}
	if _, err := h.service.DeleteContacts(getUserID(c), []uint{id}); err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}
	return response.Success(c, fiber.Map{"message": "Contact deleted"})
}

// BulkDeleteContacts godoc
// @Summary      Delete Several Contacts
// @Tags         Contacts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.ContactIDsRequest  true  "contact_ids"
// @Success      200  {object}  response.SuccessResponse
// @Router       /contacts/bulk-delete [post]
func (h *ContactHandler) BulkDeleteContacts(c *fiber.Ctx) error {
	var req models.ContactIDsRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	deleted, err := h.service.DeleteContacts(getUserID(c), req.ContactIDs)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, fiber.Map{"message": "Contacts deleted", "deleted": deleted})
}

// BulkUpsertContacts godoc
// @Summary      Import Contacts
// @Description  Add many contacts at once. Existing phone numbers are updated instead of duplicated; all are added to group_ids.
// @Tags         Contacts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.BulkContactsRequest  true  "Contacts"
// @Success      200  {object}  models.BulkContactsResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /contacts/bulk [post]
func (h *ContactHandler) BulkUpsertContacts(c *fiber.Ctx) error {
	var req models.BulkContactsRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	res, err := h.service.BulkUpsertContacts(getUserID(c), &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, res)
}

// AssignGroup godoc
// @Summary      Add Contacts to a Group
// @Tags         Contacts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.ContactIDsRequest  true  "contact_ids and group_id"
// @Success      200  {object}  response.SuccessResponse
// @Router       /contacts/assign-group [post]
func (h *ContactHandler) AssignGroup(c *fiber.Ctx) error {
	return h.setMembership(c, true)
}

// UnassignGroup godoc
// @Summary      Remove Contacts from a Group
// @Tags         Contacts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.ContactIDsRequest  true  "contact_ids and group_id"
// @Success      200  {object}  response.SuccessResponse
// @Router       /contacts/unassign-group [post]
func (h *ContactHandler) UnassignGroup(c *fiber.Ctx) error {
	return h.setMembership(c, false)
}

func (h *ContactHandler) setMembership(c *fiber.Ctx, add bool) error {
	var req models.ContactIDsRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	if err := h.service.SetGroupMembership(getUserID(c), &req, add); err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, fiber.Map{"message": "Group membership updated"})
}

// ListGroups godoc
// @Summary      List Contact Groups
// @Tags         Contacts
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.ContactGroupResponse
// @Router       /contact-groups [get]
func (h *ContactHandler) ListGroups(c *fiber.Ctx) error {
	res, err := h.service.ListGroups(getUserID(c))
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, res)
}

// CreateGroup godoc
// @Summary      Create Contact Group
// @Tags         Contacts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.ContactGroupRequest  true  "Group"
// @Success      201  {object}  models.ContactGroupResponse
// @Router       /contact-groups [post]
func (h *ContactHandler) CreateGroup(c *fiber.Ctx) error {
	var req models.ContactGroupRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	res, err := h.service.CreateGroup(getUserID(c), &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Created(c, res)
}

// UpdateGroup godoc
// @Summary      Update Contact Group
// @Tags         Contacts
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                         true  "Group ID"
// @Param        body  body  models.ContactGroupRequest  true  "Group"
// @Success      200  {object}  models.ContactGroupResponse
// @Router       /contact-groups/{id} [put]
func (h *ContactHandler) UpdateGroup(c *fiber.Ctx) error {
	id, err := parseIDParam(c)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid group ID")
	}
	var req models.ContactGroupRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	res, err := h.service.UpdateGroup(getUserID(c), id, &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, res)
}

// DeleteGroup godoc
// @Summary      Delete Contact Group
// @Description  Delete a group. Its contacts are kept.
// @Tags         Contacts
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Group ID"
// @Success      200  {object}  response.SuccessResponse
// @Router       /contact-groups/{id} [delete]
func (h *ContactHandler) DeleteGroup(c *fiber.Ctx) error {
	id, err := parseIDParam(c)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid group ID")
	}
	if err := h.service.DeleteGroup(getUserID(c), id); err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}
	return response.Success(c, fiber.Map{"message": "Group deleted"})
}
