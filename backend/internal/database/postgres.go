package database

import (
	"backend/internal/config"
	"backend/internal/models"
	"log"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Connect establishes a connection to PostgreSQL using GORM.
func Connect(cfg *config.Config) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	// Connection pool settings
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)

	log.Println("✅ Database connected successfully")
	return db, nil
}

// Migrate runs auto-migrations for all models.
func Migrate(db *gorm.DB) error {
	log.Println("🔄 Running database migrations...")
	if err := db.AutoMigrate(
		&models.User{},
		&models.UserSession{},
		&models.UserSecurityLog{},
		&models.SMSTopup{},
		&models.SMSTemplate{},
		&models.Notification{},
		&models.SMSConfig{},
		&models.SMSPricingRange{},
		&models.SMSDeliveryLog{},
		&models.SMSMessage{},
		&models.DeveloperKey{},
		&models.SMSJob{},
		&models.PaymentTransaction{},
	); err != nil {
		return err
	}
	if err := migrateLegacySMSMessages(db); err != nil {
		return err
	}

	return Seed(db)
}

func migrateLegacySMSMessages(db *gorm.DB) error {
	if err := db.Exec("ALTER TABLE sms_messages DROP CONSTRAINT IF EXISTS fk_sms_messages_customer").Error; err != nil {
		return err
	}
	if err := db.Exec("ALTER TABLE sms_messages ALTER COLUMN customer_id DROP NOT NULL").Error; err != nil {
		return err
	}
	return nil
}

// Seed populates the database with initial admin and user accounts if empty.
func Seed(db *gorm.DB) error {
	log.Println("🌱 Seeding database initial users...")
	var count int64
	if err := db.Model(&models.User{}).Count(&count).Error; err != nil {
		return err
	}

	if count > 0 {
		log.Println("🌱 Database already seeded, skipping.")
		return nil
	}

	adminPassword, err := bcrypt.GenerateFromPassword([]byte("adminpassword"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	userPassword, err := bcrypt.GenerateFromPassword([]byte("userpassword"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	users := []models.User{
		{
			Name:       "System Administrator",
			Email:      "admin@lucosms.com",
			Password:   string(adminPassword),
			Role:       "admin",
			SMSBalance: 1000,
			IsVerified: true,
		},
		{
			Name:       "Regular User",
			Email:      "user@lucosms.com",
			Password:   string(userPassword),
			Role:       "user",
			SMSBalance: 20,
			IsVerified: true,
		},
	}

	for _, u := range users {
		if err := db.Create(&u).Error; err != nil {
			return err
		}
	}

	log.Println("🌱 Seeding initial users completed successfully.")
	return nil
}
