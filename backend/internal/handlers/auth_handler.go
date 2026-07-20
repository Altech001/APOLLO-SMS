package handlers

import (
	"fmt"
	"time"

	"backend/internal/models"
	"backend/internal/services"
	"backend/pkg/email"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// AuthHandler handles HTTP requests for user authentication.
type AuthHandler struct {
	service *services.AuthService
}

// NewAuthHandler creates a new AuthHandler instance.
func NewAuthHandler(service *services.AuthService) *AuthHandler {
	return &AuthHandler{service: service}
}

// Register godoc
// @Summary      Register User
// @Description  Register a new user and trigger verification email
// @Tags         Auth
// @Accept       json
// @Produce      json
// @Param        body  body  models.RegisterRequest  true  "User details"
// @Success      201  {object}  models.UserResponse
// @Failure      400  {object}  response.ErrorResponse
// @Failure      409  {object}  response.ErrorResponse
// @Router       /auth/register [post]
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req models.RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	ipAddress := c.IP()
	userAgent := c.Get("User-Agent")

	user, err := h.service.Register(&req, ipAddress, userAgent)
	if err != nil {
		return response.Error(c, fiber.StatusConflict, err.Error())
	}

	return response.Created(c, user.ToResponse())
}

// VerifyEmail godoc
// @Summary      Verify Email
// @Description  Verifies user email via token (returns HTML for browsers, JSON for APIs)
// @Tags         Auth
// @Accept       json
// @Produce      html,json
// @Param        token  query  string  true  "Verification Token"
// @Success      200  {object}  response.SuccessResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /auth/verify-email [get]
func (h *AuthHandler) VerifyEmail(c *fiber.Ctx) error {
	token := c.Query("token")
	if token == "" {
		return response.Error(c, fiber.StatusBadRequest, "Token query parameter is required")
	}

	ipAddress := c.IP()
	userAgent := c.Get("User-Agent")

	err := h.service.VerifyEmail(token, ipAddress, userAgent)

	// If browser/client expects HTML or is a direct browser access
	if c.Accepts("text/html", "html") != "" {
		if err != nil {
			htmlContent, htmlErr := email.GetVerifyFailedHTML(err.Error())
			if htmlErr != nil {
				return response.Error(c, fiber.StatusInternalServerError, "Failed to render error page")
			}
			c.Set("Content-Type", "text/html")
			return c.Status(fiber.StatusBadRequest).SendString(htmlContent)
		}

		htmlContent, htmlErr := email.GetVerifySuccessHTML()
		if htmlErr != nil {
			return response.Error(c, fiber.StatusInternalServerError, "Failed to render success page")
		}
		c.Set("Content-Type", "text/html")
		return c.Status(fiber.StatusOK).SendString(htmlContent)
	}

	// For normal JSON response API calls
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, fiber.Map{"message": "Email verified successfully"})
}

// Login godoc
// @Summary      Login User
// @Description  Authenticate user and return JWT access token
// @Tags         Auth
// @Accept       json
// @Produce      json
// @Param        body  body  models.LoginRequest  true  "Credentials"
// @Success      200  {object}  models.LoginResponse
// @Failure      400  {object}  response.ErrorResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /auth/login [post]
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req models.LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	ipAddress := c.IP()
	userAgent := c.Get("User-Agent")

	user, token, err := h.service.Login(&req, ipAddress, userAgent)
	if err != nil {
		return response.Error(c, fiber.StatusUnauthorized, err.Error())
	}

	return response.Success(c, models.LoginResponse{
		User:  user.ToResponse(),
		Token: token,
	})
}

// ForgotPassword godoc
// @Summary      Forgot Password
// @Description  Request a password reset link to be sent via email
// @Tags         Auth
// @Accept       json
// @Produce      json
// @Param        body  body  models.ForgotPasswordRequest  true  "User email"
// @Success      200  {object}  response.SuccessResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /auth/forgot-password [post]
func (h *AuthHandler) ForgotPassword(c *fiber.Ctx) error {
	var req models.ForgotPasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	ipAddress := c.IP()
	userAgent := c.Get("User-Agent")

	err := h.service.ForgotPassword(&req, ipAddress, userAgent)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, err.Error())
	}

	return response.Success(c, fiber.Map{"message": "If the account exists, a password reset link has been sent to your email"})
}

// GetResetPassword renders password reset HTML form for browsers
func (h *AuthHandler) GetResetPassword(c *fiber.Ctx) error {
	token := c.Query("token")
	if token == "" {
		return response.Error(c, fiber.StatusBadRequest, "Token query parameter is required")
	}

	htmlContent, err := email.GetResetFormHTML(token)
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "Failed to render password reset form")
	}

	c.Set("Content-Type", "text/html")
	return c.Status(fiber.StatusOK).SendString(htmlContent)
}

// ResetPassword godoc
// @Summary      Reset Password
// @Description  Submit password reset token and new password (supports JSON and form submits)
// @Tags         Auth
// @Accept       json,x-www-form-urlencoded
// @Produce      html,json
// @Param        body  body  models.ResetPasswordRequest  true  "Reset parameters"
// @Success      200  {object}  response.SuccessResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /auth/reset-password [post]
func (h *AuthHandler) ResetPassword(c *fiber.Ctx) error {
	var req models.ResetPasswordRequest

	// Handle both form submit (from our custom HTML page) and raw JSON
	if c.Get("Content-Type") == "application/x-www-form-urlencoded" {
		req.Token = c.FormValue("token")
		req.NewPassword = c.FormValue("new_password")
	} else {
		if err := c.BodyParser(&req); err != nil {
			return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
		}
	}

	ipAddress := c.IP()
	userAgent := c.Get("User-Agent")

	details, device, err := h.service.ResetPassword(&req, ipAddress, userAgent)

	// If request came from our HTML form, reply with a beautiful HTML landing page
	if c.Get("Content-Type") == "application/x-www-form-urlencoded" || c.Accepts("text/html", "html") != "" {
		if err != nil {
			htmlContent, htmlErr := email.GetResetFailedHTML(err.Error())
			if htmlErr != nil {
				return response.Error(c, fiber.StatusInternalServerError, "Failed to render error page")
			}
			c.Set("Content-Type", "text/html")
			return c.Status(fiber.StatusBadRequest).SendString(htmlContent)
		}

		locationStr := "Unknown Location"
		ispStr := "Unknown ISP"
		connType := "Unknown Connection"
		flagURL := ""
		resolvedIP := ipAddress
		if resolvedIP == "127.0.0.1" || resolvedIP == "::1" || resolvedIP == "" {
			resolvedIP = "102.209.109.157" // mock public IP details in browser locally
		}

		if details != nil {
			locationStr = fmt.Sprintf("%s, %s, %s %s", details.City, details.StateProv, details.CountryName, details.CountryEmoji)
			ispStr = details.ISP
			connType = details.ConnectionTy
			flagURL = details.CountryFlag
		}

		timeStr := time.Now().Format("2006-01-02 15:04:05 (MST)")

		htmlContent, htmlErr := email.GetResetSuccessHTML(email.ResetSuccessData{
			IPAddress:    resolvedIP,
			Location:     locationStr,
			CountryFlag:  flagURL,
			ISP:          ispStr,
			ConnectionTy: connType,
			Device:       device,
			Time:         timeStr,
		})
		if htmlErr != nil {
			return response.Error(c, fiber.StatusInternalServerError, "Failed to render success page")
		}

		c.Set("Content-Type", "text/html")
		return c.Status(fiber.StatusOK).SendString(htmlContent)
	}

	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, fiber.Map{"message": "Password has been reset successfully"})
}

// ResendVerification godoc
// @Summary      Resend Verification
// @Description  Resend email verification link for an unverified account
// @Tags         Auth
// @Accept       json
// @Produce      json
// @Param        body  body  models.ResendVerificationRequest  true  "User email"
// @Success      200  {object}  response.SuccessResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /auth/resend-verification [post]
func (h *AuthHandler) ResendVerification(c *fiber.Ctx) error {
	var req models.ResendVerificationRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	ipAddress := c.IP()
	userAgent := c.Get("User-Agent")

	err := h.service.ResendVerification(&req, ipAddress, userAgent)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}

	return response.Success(c, fiber.Map{"message": "A new email verification link has been sent to your email"})
}

// ChangePassword godoc
// @Summary      Change Password
// @Description  Change password of the logged-in user
// @Tags         Auth
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.ChangePasswordRequest  true  "Password details"
// @Success      200  {object}  response.SuccessResponse
// @Failure      400  {object}  response.ErrorResponse
// @Failure      401  {object}  response.ErrorResponse
// @Router       /auth/change-password [post]
func (h *AuthHandler) ChangePassword(c *fiber.Ctx) error {
	var req models.ChangePasswordRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	userID := getUserID(c)
	if userID == 0 {
		return response.Error(c, fiber.StatusUnauthorized, "Unauthorized")
	}

	ipAddress := c.IP()
	userAgent := c.Get("User-Agent")

	err := h.service.ChangePassword(userID, &req, ipAddress, userAgent)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}

	return response.Success(c, fiber.Map{"message": "Password updated successfully"})
}

