package routes

import (
	"log"
	"time"

	"backend/internal/config"
	"backend/internal/handlers"
	"backend/internal/middleware"
	"backend/internal/repository"
	"backend/internal/services"
	"backend/pkg/email"
	"backend/pkg/ipgeo"
	"backend/pkg/storage"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// Setup wires dependencies and registers all authentication, security, and user CRUD endpoints.
func Setup(app *fiber.App, db *gorm.DB, cfg *config.Config) {
	// ── Infrastructure/Clients ──
	emailSender := email.NewEmailSender(cfg.ResendAPIKey, cfg.ResendFromEmail)
	ipgeoClient := ipgeo.NewClient(cfg.IPGeoAPIKey)

	storageProvider, err := storage.NewProvider(
		cfg.StorageProvider,
		"uploads",
		cfg.PublicURL("/uploads"),
		cfg.R2EndpointURL,
		cfg.R2AccessKeyID,
		cfg.R2SecretAccessKey,
		cfg.R2BucketName,
		cfg.R2PublicBaseURL,
	)
	if err != nil {
		log.Fatalf("Failed to initialize storage provider: %v", err)
	}

	// ── Repositories ──
	userRepo := repository.NewUserRepository(db)
	securityRepo := repository.NewSecurityRepository(db)
	topupRepo := repository.NewSMSTopupRepository(db)
	templateRepo := repository.NewSMSTemplateRepository(db)
	smsConfigRepo := repository.NewSMSConfigRepository(db)
	developerKeyRepo := repository.NewDeveloperKeyRepository(db)
	notifRepo := repository.NewNotificationRepository(db)
	paymentRepo := repository.NewPaymentRepository(db)

	// ── Services ──
	redisService := services.NewRedisService(cfg)
	rateLimiter := services.NewRateLimiterService()
	notifService := services.NewNotificationService(notifRepo)
	authService := services.NewAuthService(userRepo, securityRepo, emailSender, ipgeoClient, cfg, notifService, redisService)
	securityService := services.NewSecurityService(securityRepo)
	userService := services.NewUserService(userRepo, storageProvider)
	templateService := services.NewSMSTemplateService(templateRepo, notifService)
	smsConfigService := services.NewSMSConfigService(smsConfigRepo, notifService, cfg)
	topupService := services.NewSMSTopupService(db, topupRepo, userRepo, notifService, smsConfigService, redisService)
	topupService.SetEmailSender(emailSender)
	developerKeyService := services.NewDeveloperKeyService(db, developerKeyRepo, userRepo, smsConfigRepo, notifService, redisService)
	paymentService := services.NewPaymentService(db, paymentRepo, notifService, smsConfigService, redisService, cfg)

	// Start Postgres SKIP LOCKED background SMS worker
	developerKeyService.StartQueueWorker(smsConfigService)

	// ── Handlers ──
	healthHandler := handlers.NewHealthHandler()
	authHandler := handlers.NewAuthHandler(authService)
	securityHandler := handlers.NewSecurityHandler(securityService)
	userHandler := handlers.NewUserHandler(userService)
	topupHandler := handlers.NewSMSTopupHandler(topupService)
	templateHandler := handlers.NewSMSTemplateHandler(templateService)
	notifHandler := handlers.NewNotificationHandler(notifService)
	smsConfigHandler := handlers.NewSMSConfigHandler(smsConfigService, developerKeyService)
	developerKeyHandler := handlers.NewDeveloperKeyHandler(developerKeyService)
	paymentHandler := handlers.NewPaymentHandler(paymentService)

	// ── API Router ──
	api := app.Group("/api/v1")

	// Health check
	api.Get("/health", healthHandler.HealthCheck)

	// Public Auth Group with Rate Limiting (10 requests per minute)
	auth := api.Group("/auth", middleware.RateLimit(rateLimiter, 10, time.Minute))
	auth.Post("/register", authHandler.Register)
	auth.Get("/verify-email", authHandler.VerifyEmail)
	auth.Post("/login", authHandler.Login)
	auth.Post("/forgot-password", authHandler.ForgotPassword)
	auth.Get("/reset-password", authHandler.GetResetPassword) // Serves form to browser
	auth.Post("/reset-password", authHandler.ResetPassword)   // Handles form submit / API json
	auth.Post("/resend-verification", authHandler.ResendVerification)
	auth.Post("/change-password", middleware.AuthRequired(cfg, db), authHandler.ChangePassword)

	// Protected Security Group (Requires valid token and session check)
	security := api.Group("/security", middleware.AuthRequired(cfg, db))
	security.Get("/sessions", securityHandler.GetSessions)
	security.Delete("/sessions", securityHandler.RevokeOtherSessions)
	security.Delete("/sessions/:id", securityHandler.RevokeSession)
	security.Get("/logs", securityHandler.GetSecurityLogs)

	// Protected User CRUD Group (Admin only access)
	users := api.Group("/users", middleware.AuthRequired(cfg, db))
	users.Get("/", middleware.RoleRequired("admin"), userHandler.ListUsers)
	users.Get("/topups", middleware.RoleRequired("admin"), topupHandler.ListAllTopups)
	users.Get("/me", userHandler.GetMe)
	users.Put("/me", userHandler.UpdateMe)
	users.Get("/me/topups", topupHandler.GetMyTopups)
	users.Get("/share/recipients", userHandler.SearchCreditRecipients)
	users.Get("/:id", middleware.RoleRequired("admin"), userHandler.GetUser)
	users.Post("/", middleware.RoleRequired("admin"), userHandler.CreateUser)
	users.Put("/:id", middleware.RoleRequired("admin"), userHandler.UpdateUser)
	users.Delete("/:id", middleware.RoleRequired("admin"), userHandler.DeleteUser)
	users.Post("/:id/profile-image", userHandler.UploadProfileImage)
	users.Post("/share", middleware.AuthRequired(cfg, db), topupHandler.ShareCredits)
	users.Post("/:id/topup", middleware.RoleRequired("admin"), topupHandler.PerformTopup)
	users.Get("/:id/topups", middleware.RoleRequired("admin"), topupHandler.GetUserTopups)

	// Protected SMS Templates Group (Each user manages their own templates)
	templates := api.Group("/sms-templates", middleware.AuthRequired(cfg, db))
	templates.Post("/", templateHandler.CreateTemplate)
	templates.Get("/", templateHandler.ListTemplates)
	templates.Get("/:id", templateHandler.GetTemplate)
	templates.Put("/:id", templateHandler.UpdateTemplate)
	templates.Delete("/:id", templateHandler.DeleteTemplate)

	// Protected Notifications Group (Each user manages their own notifications)
	notifications := api.Group("/notifications", middleware.AuthRequired(cfg, db))
	notifications.Get("/", notifHandler.ListNotifications)
	notifications.Get("/unread", notifHandler.ListUnread)
	notifications.Get("/unread/count", notifHandler.CountUnread)
	notifications.Put("/:id/read", notifHandler.MarkAsRead)
	notifications.Put("/read-all", notifHandler.MarkAllAsRead)

	// Authenticated in-app SMS sending. This deducts user balance and records SMS jobs.
	api.Post("/sms-config/send", middleware.AuthRequired(cfg, db), smsConfigHandler.SendSMS)
	api.Get("/sms-pricing", middleware.AuthRequired(cfg, db), smsConfigHandler.GetPublicPricing)
	api.Get("/sms/messages", middleware.AuthRequired(cfg, db), developerKeyHandler.ListUserMessages)
	api.Get("/sms/dashboard", middleware.AuthRequired(cfg, db), developerKeyHandler.GetUserSMSDashboard)

	// Protected SMS Config Group (Admin only — platform-wide provider configuration)
	smsConfig := api.Group("/sms-config", middleware.AuthRequired(cfg, db), middleware.RoleRequired("admin"))
	smsConfig.Get("/", smsConfigHandler.GetConfig)
	smsConfig.Put("/", smsConfigHandler.SaveConfig)
	smsConfig.Get("/pricing-ranges", smsConfigHandler.GetPricingRanges)
	smsConfig.Post("/pricing-ranges", smsConfigHandler.SavePricingRanges)
	smsConfig.Put("/pricing-ranges", smsConfigHandler.SavePricingRanges)
	smsConfig.Get("/balance", smsConfigHandler.CheckBalance)
	smsConfig.Get("/delivery-logs", smsConfigHandler.GetDeliveryLogs)
	smsConfig.Get("/failed-jobs", developerKeyHandler.GetFailedJobs)
	smsConfig.Get("/usage-summary", paymentHandler.UsageSummary)

	// Pricing range aliases for clients that address the table/resource directly.
	api.Get("/sms-pricing-ranges", middleware.AuthRequired(cfg, db), middleware.RoleRequired("admin"), smsConfigHandler.GetPricingRanges)
	api.Post("/sms-pricing-ranges", middleware.AuthRequired(cfg, db), middleware.RoleRequired("admin"), smsConfigHandler.SavePricingRanges)
	api.Put("/sms-pricing-ranges", middleware.AuthRequired(cfg, db), middleware.RoleRequired("admin"), smsConfigHandler.SavePricingRanges)
	api.Get("/sms_pricing_ranges", middleware.AuthRequired(cfg, db), middleware.RoleRequired("admin"), smsConfigHandler.GetPricingRanges)
	api.Post("/sms_pricing_ranges", middleware.AuthRequired(cfg, db), middleware.RoleRequired("admin"), smsConfigHandler.SavePricingRanges)
	api.Put("/sms_pricing_ranges", middleware.AuthRequired(cfg, db), middleware.RoleRequired("admin"), smsConfigHandler.SavePricingRanges)

	// Developer API Keys Management (JWT authenticated)
	devKeys := api.Group("/developer-keys", middleware.AuthRequired(cfg, db))
	devKeys.Post("/", developerKeyHandler.CreateKey)
	devKeys.Get("/", developerKeyHandler.GetKeys)
	devKeys.Delete("/:id", developerKeyHandler.RevokeKey)

	// Public API Gateway route (authenticates via API key in handler)
	api.Post("/gateway/send", developerKeyHandler.GatewaySendSMS)

	// Public JulySMS Delivery Webhook (verified via HMAC-SHA256, not JWT)
	api.Post("/sms-config/webhooks/julysms", smsConfigHandler.JulySMSWebhook)

	// Payments and MarzPay callbacks
	payments := api.Group("/payments", middleware.AuthRequired(cfg, db))
	payments.Post("/collections", paymentHandler.CreateCollection)
	payments.Get("/collections/:reference", paymentHandler.GetCollection)
	payments.Get("/transactions", middleware.RoleRequired("admin"), paymentHandler.ListTransactions)
	payments.Post("/withdrawals", middleware.RoleRequired("admin"), paymentHandler.CreateWithdrawal)
	api.Post("/payments/webhooks/marzpay", paymentHandler.MarzPayWebhook)
}
