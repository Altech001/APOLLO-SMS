package middleware

import (
	"time"

	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// RateLimit returns a middleware that limits requests by client IP + route path.
func RateLimit(limiter *services.RateLimiterService, limit int, window time.Duration) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Unique key composed of client IP and route path
		key := c.IP() + ":" + c.Path()

		if !limiter.IsAllowed(key, limit, window) {
			return response.Error(c, fiber.StatusTooManyRequests, "Too many requests. Please try again later.")
		}

		return c.Next()
	}
}
