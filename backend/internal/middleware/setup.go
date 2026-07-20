package middleware

import (
	"backend/internal/config"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
)

// Setup registers all global middleware on the Fiber app.
func Setup(app *fiber.App, cfg *config.Config) {
	// Recover from panics
	app.Use(recover.New())

	// Request ID for tracing
	app.Use(requestid.New())

	// Logger
	app.Use(logger.New(logger.Config{
		Format:     "${time} | ${status} | ${latency} | ${method} | ${path} | ${ip} | ${reqHeader:X-Request-ID}\n",
		TimeFormat: "2006-01-02 15:04:05",
	}))

	// CORS
	app.Use(cors.New(cors.Config{
		AllowOriginsFunc: func(origin string) bool {
			return true
		},
		AllowHeaders:  "Origin, Content-Type, Accept, Authorization, X-Request-ID, X-API-Key, X-Signature, Client-ID, Client-Secret",
		AllowMethods:  "GET, POST, PUT, PATCH, DELETE, OPTIONS",
		ExposeHeaders: "Content-Length, Content-Type, X-Request-ID",
		MaxAge:        86400,
	}))
}
