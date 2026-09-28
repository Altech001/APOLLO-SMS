package main

import (
	"log"

	"backend/internal/config"
	"backend/internal/database"
	"backend/internal/middleware"
	"backend/internal/routes"

	"github.com/gofiber/fiber/v2"

	_ "backend/docs" // swagger docs

	fiberSwagger "github.com/swaggo/fiber-swagger"
)

// @title           Luco SMS API
// @version         1.0
// @description     Backend service for SMS delivery and customer management.
// @termsOfService  http://swagger.io/terms/

// @contact.name   API Support
// @contact.email  support@lucosms.com

// @license.name  Private
// @license.url   https://lucosms.com

// @host      localhost:8000
// @BasePath  /api/v1

// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
func main() {
	// Load configuration
	cfg := config.Load()

	// Connect to database
	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Versioned SQL migrations always run (they are recorded and applied once each).
	if err := database.RunSQLMigrations(db); err != nil {
		log.Fatalf("Failed to run SQL migrations: %v", err)
	}

	if cfg.AutoMigrate {
		if err := database.Migrate(db); err != nil {
			log.Fatalf("Failed to run migrations: %v", err)
		}
	} else {
		log.Println("Database auto-migrations disabled")
	}

	// Create Fiber app
	app := fiber.New(fiber.Config{
		AppName:      "Luco SMS API",
		ErrorHandler: middleware.ErrorHandler,
		BodyLimit:    8 << 20, // room for 5 MB image uploads plus multipart overhead
	})

	// Global middleware
	middleware.Setup(app, cfg)

	// Swagger
	app.Get("/swagger/*", fiberSwagger.WrapHandler)

	// Serve uploaded files statically
	app.Static("/uploads", "./uploads")

	// Register routes
	routes.Setup(app, db, cfg)

	// Start server
	log.Printf("🚀 Server starting on port %s", cfg.Port)
	log.Fatal(app.Listen(":" + cfg.Port))
}
