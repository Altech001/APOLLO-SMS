package config

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all application configuration.
type Config struct {
	Port              string
	DatabaseURL       string
	JWTSecret         string
	Environment       string
	ResendAPIKey      string
	ResendFromEmail   string
	IPGeoAPIKey       string
	StorageProvider   string
	R2AccessKeyID     string
	R2SecretAccessKey string
	R2BucketName      string
	R2EndpointURL     string
	R2PublicBaseURL   string
	RedisAddr         string
	RedisUsername     string
	RedisPassword     string
	RedisDB           int
	MarzPayBaseURL    string
	MarzPayBasicAuth  string
	PublicBaseURL     string
	AutoMigrate       bool
	GormLogLevel      string
	SMSQueueWorker    bool
	SMSQueuePollDelay time.Duration
}

// Load reads configuration from .env file and environment variables.
func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("⚠️  No .env file found, using environment variables")
	}
	port := getEnv("PORT", "8000")
	environment := getEnv("ENVIRONMENT", "development")
	publicBaseURL := getEnvAny([]string{"PUBLIC_URL", "PUBLIC_BASE_URL"}, "")
	return &Config{
		Port:              port,
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/lucosms?sslmode=disable"),
		JWTSecret:         getEnv("JWT_SECRET", "super-secret-change-me"),
		Environment:       environment,
		ResendAPIKey:      getEnv("RESEND_API_KEY", ""),
		ResendFromEmail:   getEnv("RESEND_FROM_EMAIL", "Beta <beta@info.pitbox.fun>"),
		IPGeoAPIKey:       getEnv("IPGEO_API_KEY", "cac1d67f47e94328bae8f50764d4342e"),
		StorageProvider:   getEnv("STORAGE_PROVIDER", "local"),
		R2AccessKeyID:     getEnv("R2_ACCESS_KEY_ID", ""),
		R2SecretAccessKey: getEnv("R2_SECRET_ACCESS_KEY", ""),
		R2BucketName:      getEnv("R2_BUCKET_NAME", ""),
		R2EndpointURL:     getEnv("R2_ENDPOINT_URL", ""),
		R2PublicBaseURL:   getEnv("R2_PUBLIC_BASE_URL", ""),
		RedisAddr:         getEnv("REDIS_ADDR", ""),
		RedisUsername:     getEnv("REDIS_USERNAME", "default"),
		RedisPassword:     getEnv("REDIS_PASSWORD", ""),
		RedisDB:           getEnvInt("REDIS_DB", 0),
		MarzPayBaseURL:    getEnv("MARZPAY_BASE_URL", "https://wallet.wearemarz.com/api/v1"),
		MarzPayBasicAuth:  getEnv("MARZPAY_BASIC_AUTH", ""),
		PublicBaseURL:     strings.TrimRight(publicBaseURL, "/"),
		AutoMigrate:       getEnvBool("AUTO_MIGRATE", true),
		GormLogLevel:      getEnv("GORM_LOG_LEVEL", "error"),
		SMSQueueWorker:    getEnvBool("SMS_QUEUE_WORKER_ENABLED", strings.EqualFold(environment, "production")),
		SMSQueuePollDelay: time.Duration(getEnvInt("SMS_QUEUE_POLL_SECONDS", 5)) * time.Second,
	}
}

// PublicURL builds an absolute URL using PUBLIC_URL/PUBLIC_BASE_URL when configured.
func (c *Config) PublicURL(path string) string {
	baseURL := c.PublicBaseURL
	if baseURL == "" {
		baseURL = "http://localhost:" + c.Port
	}
	if path == "" {
		return baseURL
	}
	return strings.TrimRight(baseURL, "/") + "/" + strings.TrimLeft(path, "/")
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return fallback
}

func getEnvAny(keys []string, fallback string) string {
	for _, key := range keys {
		if val, ok := os.LookupEnv(key); ok && strings.TrimSpace(val) != "" {
			return val
		}
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	val := getEnv(key, "")
	if val == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(val)
	if err != nil {
		return fallback
	}
	return parsed
}

func getEnvBool(key string, fallback bool) bool {
	val := strings.TrimSpace(strings.ToLower(getEnv(key, "")))
	if val == "" {
		return fallback
	}
	switch val {
	case "1", "true", "yes", "y", "on":
		return true
	case "0", "false", "no", "n", "off":
		return false
	default:
		return fallback
	}
}
