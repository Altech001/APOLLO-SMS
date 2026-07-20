package middleware

import (
	"strings"

	"backend/internal/config"
	"backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// AuthRequired is a middleware that checks for a valid Bearer token and verifies active session.
func AuthRequired(cfg *config.Config, db *gorm.DB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		auth := c.Get("Authorization")
		if auth == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"error":   "Missing authorization header",
			})
		}

		tokenStr := strings.TrimPrefix(auth, "Bearer ")
		if tokenStr == auth { // no Bearer prefix found
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"error":   "Invalid authorization format. Use: Bearer <token>",
			})
		}

		// Parse and validate JWT
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			// Validate signing algorithm
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(cfg.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"error":   "Invalid or expired authorization token",
			})
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"error":   "Invalid token claims",
			})
		}

		// Verify Session is active in database (revocation support)
		sid, ok := claims["sid"].(string)
		if !ok || sid == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"error":   "Invalid session identifier in token",
			})
		}

		var session models.UserSession
		if err := db.Where("token_id = ? AND is_active = ?", sid, true).First(&session).Error; err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"success": false,
				"error":   "Your session has been revoked or expired",
			})
		}

		// Store sub (userID), email, and session UUID in locals
		c.Locals("userId", claims["sub"])
		c.Locals("email", claims["email"])
		c.Locals("role", claims["role"])
		c.Locals("sessionId", sid)

		return c.Next()
	}
}

// RoleRequired enforces that the user has one of the allowed roles.
func RoleRequired(allowedRoles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		roleVal := c.Locals("role")
		role, ok := roleVal.(string)
		if !ok || role == "" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"error":   "Access denied. Missing user role",
			})
		}

		for _, r := range allowedRoles {
			if r == role {
				return c.Next()
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"error":   "Access denied. Insufficient permissions",
		})
	}
}
