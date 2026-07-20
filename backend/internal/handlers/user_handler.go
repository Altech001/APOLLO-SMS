package handlers

import (
	"fmt"
	"io"
	"path/filepath"
	"strconv"

	"backend/internal/models"
	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// UserHandler handles HTTP requests for User CRUD.
type UserHandler struct {
	service *services.UserService
}

// NewUserHandler creates a new UserHandler instance.
func NewUserHandler(service *services.UserService) *UserHandler {
	return &UserHandler{service: service}
}

type updateProfileRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

func (h *UserHandler) GetMe(c *fiber.Ctx) error {
	currentUserID := getUserID(c)
	if currentUserID == 0 {
		return response.Error(c, fiber.StatusUnauthorized, "Unauthorized")
	}

	user, err := h.service.GetUserByID(currentUserID)
	if err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}

	return response.Success(c, user)
}

func (h *UserHandler) UpdateMe(c *fiber.Ctx) error {
	currentUserID := getUserID(c)
	if currentUserID == 0 {
		return response.Error(c, fiber.StatusUnauthorized, "Unauthorized")
	}

	var req updateProfileRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	if req.Name == "" {
		return response.Error(c, fiber.StatusBadRequest, "name is required")
	}
	if req.Email == "" {
		return response.Error(c, fiber.StatusBadRequest, "email is required")
	}

	user, err := h.service.UpdateProfile(currentUserID, req.Name, req.Email)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}

	return response.Success(c, user)
}

// ListUsers godoc
// @Summary      List Users
// @Description  List all registered users in the system (Admin only)
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  models.UserResponse
// @Failure      401  {object}  response.ErrorResponse
// @Failure      403  {object}  response.ErrorResponse
// @Router       /users [get]
func (h *UserHandler) ListUsers(c *fiber.Ctx) error {
	users, err := h.service.GetAllUsers()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}
	return response.Success(c, users)
}

// GetUser godoc
// @Summary      Get User details
// @Description  Retrieve details of a specific user by ID
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "User ID"
// @Success      200  {object}  models.UserResponse
// @Failure      404  {object}  response.ErrorResponse
// @Router       /users/{id} [get]
func (h *UserHandler) GetUser(c *fiber.Ctx) error {
	idParam := c.Params("id")
	userID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid User ID format")
	}

	user, err := h.service.GetUserByID(uint(userID))
	if err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}

	return response.Success(c, user)
}

// CreateUser godoc
// @Summary      Create User
// @Description  Create a new user directly in the database (Admin only)
// @Tags         Users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.CreateUserRequest  true  "User parameters"
// @Success      201  {object}  models.UserResponse
// @Failure      400  {object}  response.ErrorResponse
// @Failure      409  {object}  response.ErrorResponse
// @Router       /users [post]
func (h *UserHandler) CreateUser(c *fiber.Ctx) error {
	var req models.CreateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	user, err := h.service.CreateUser(&req)
	if err != nil {
		return response.Error(c, fiber.StatusConflict, err.Error())
	}

	return response.Created(c, user)
}

// UpdateUser godoc
// @Summary      Update User details
// @Description  Update details of a user including Role and SMS balance (Admin only)
// @Tags         Users
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                      true  "User ID"
// @Param        body  body  models.UpdateUserRequest  true  "User update fields"
// @Success      200  {object}  models.UserResponse
// @Failure      400  {object}  response.ErrorResponse
// @Failure      404  {object}  response.ErrorResponse
// @Router       /users/{id} [put]
func (h *UserHandler) UpdateUser(c *fiber.Ctx) error {
	idParam := c.Params("id")
	userID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid User ID format")
	}

	var req models.UpdateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	user, err := h.service.UpdateUser(uint(userID), &req)
	if err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}

	return response.Success(c, user)
}

// DeleteUser godoc
// @Summary      Delete User
// @Description  Soft delete a user from the system (Admin only)
// @Tags         Users
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "User ID"
// @Success      200  {object}  response.SuccessResponse
// @Failure      404  {object}  response.ErrorResponse
// @Router       /users/{id} [delete]
func (h *UserHandler) DeleteUser(c *fiber.Ctx) error {
	idParam := c.Params("id")
	userID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid User ID format")
	}

	err = h.service.DeleteUser(uint(userID))
	if err != nil {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}

	return response.Success(c, fiber.Map{"message": "User deleted successfully"})
}

// UploadProfileImage godoc
// @Summary      Upload Profile Image
// @Description  Upload a profile image for a specific user (allows user to upload their own or admin to upload)
// @Tags         Users
// @Security     BearerAuth
// @Accept       mpfd
// @Produce      json
// @Param        id    path  int   true  "User ID"
// @Param        file  formData  file  true  "Profile Image file"
// @Success      200  {object}  models.UserResponse
// @Failure      400  {object}  response.ErrorResponse
// @Failure      404  {object}  response.ErrorResponse
// @Router       /users/{id}/profile-image [post]
func (h *UserHandler) UploadProfileImage(c *fiber.Ctx) error {
	idParam := c.Params("id")
	userID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid User ID format")
	}

	// Authorization check: User can only upload their own image, unless they are admin
	currentUserID := getUserID(c)
	currentUserRoleVal := c.Locals("role")
	currentUserRole, _ := currentUserRoleVal.(string)

	if uint(userID) != currentUserID && currentUserRole != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"error":   "Access denied. You can only upload your own profile image.",
		})
	}

	// Parse file from form
	file, err := c.FormFile("file")
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Failed to parse file from request")
	}

	// Open file to read content bytes
	src, err := file.Open()
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "Failed to open uploaded file")
	}
	defer src.Close()

	// Read content into memory
	fileBytes, err := io.ReadAll(src)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "Failed to read uploaded file")
	}

	contentType := file.Header.Get("Content-Type")

	// Generate unique key (preserving older versions on storage provider)
	ext := filepath.Ext(file.Filename)
	uniqueName := fmt.Sprintf("profile_images/%d_%s%s", userID, uuid.New().String(), ext)

	// Delegate upload to service using the pluggable StorageProvider
	user, err := h.service.UploadProfileImage(uint(userID), uniqueName, fileBytes, contentType)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}

	return response.Success(c, user)
}
