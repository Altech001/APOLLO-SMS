package middleware

import (
	"github.com/gofiber/fiber/v2"
)

// ErrorHandler is a custom Fiber error handler that returns consistent JSON errors.
func ErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError

	// Check if it's a Fiber error with a status code
	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
	}

	return c.Status(code).JSON(fiber.Map{
		"success": false,
		"error":   err.Error(),
	})
}
