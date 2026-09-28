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
	FrontendURL       string // web app origin; email verification links open its /verify-email page
	AutoMigrate       bool
	GormLogLevel      string
	SMSQueueWorker    bool
	SMSQueuePollDelay time.Duration

	// WhatsApp (whatsmeow multi-device sessions)
	WhatsAppEnabled            bool
	WhatsAppMinDelay           time.Duration
	WhatsAppMaxDelay           time.Duration
	WhatsAppDailyLimit         int
	WhatsAppWarmupDailyLimit   int
	WhatsAppWarmupDays         int
	WhatsAppMaxRecipients      int
	WhatsAppMaxAccountsPerUser int

	// Verification / password reset codes sent by SMS are billed to the user's account.
	AuthSMSFeeUGX     int // price shown to the user and recorded per SMS
	AuthSMSFeeCredits int // SMS credits deducted per SMS

	// AI template generation (NVIDIA NIM, OpenAI-compatible)
	NVIDIAAPIKey  string
	NVIDIABaseURL string
	NVIDIAModel   string
	// AI image generation (NVIDIA NIM genai endpoint, e.g. FLUX.1-schnell)
	NVIDIAImageBaseURL string
	NVIDIAImageModel   string
	PexelsAPIKey       string
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
		FrontendURL:       strings.TrimRight(getEnv("FRONTEND_URL", ""), "/"),
		AutoMigrate:       getEnvBool("AUTO_MIGRATE", true),
		GormLogLevel:      getEnv("GORM_LOG_LEVEL", "error"),
		SMSQueueWorker:    getEnvBool("SMS_QUEUE_WORKER_ENABLED", strings.EqualFold(environment, "production")),
		SMSQueuePollDelay: time.Duration(getEnvInt("SMS_QUEUE_POLL_SECONDS", 5)) * time.Second,

		WhatsAppEnabled:            getEnvBool("WHATSAPP_ENABLED", true),
		WhatsAppMinDelay:           time.Duration(getEnvInt("WHATSAPP_MIN_DELAY_SECONDS", 4)) * time.Second,
		WhatsAppMaxDelay:           time.Duration(getEnvInt("WHATSAPP_MAX_DELAY_SECONDS", 12)) * time.Second,
		WhatsAppDailyLimit:         getEnvInt("WHATSAPP_DAILY_LIMIT", 250),
		WhatsAppWarmupDailyLimit:   getEnvInt("WHATSAPP_WARMUP_DAILY_LIMIT", 40),
		WhatsAppWarmupDays:         getEnvInt("WHATSAPP_WARMUP_DAYS", 7),
		WhatsAppMaxRecipients:      getEnvInt("WHATSAPP_MAX_RECIPIENTS", 200),
		WhatsAppMaxAccountsPerUser: getEnvInt("WHATSAPP_MAX_ACCOUNTS_PER_USER", 3),

		AuthSMSFeeUGX:     getEnvInt("AUTH_SMS_FEE_UGX", 35),
		AuthSMSFeeCredits: getEnvInt("AUTH_SMS_FEE_CREDITS", 1),

		NVIDIAAPIKey:       getEnv("NVIDIA_API_KEY", ""),
		NVIDIABaseURL:      strings.TrimRight(getEnv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"), "/"),
		NVIDIAModel:        getEnv("NVIDIA_MODEL", "nvidia/nemotron-3-super-120b-a12b,nvidia/nemotron-3-ultra-550b-a55b,nvidia/nemotron-3.5-lightning-30b-a3b,deepseek-ai/deepseek-v4.1-flash,moonshotai/kimi-k3,z-ai/glm-5.3-flash,openai/gpt-oss-20b"),
		NVIDIAImageBaseURL: strings.TrimRight(getEnv("NVIDIA_IMAGE_BASE_URL", "https://ai.api.nvidia.com/v1/genai"), "/"),
		PexelsAPIKey:       getEnv("PEXELS_API_KEY", getEnv("PEXEL_API_KEY", "")),
		NVIDIAImageModel:   getEnv("NVIDIA_IMAGE_MODEL", "black-forest-labs/flux.2-klein-4b,black-forest-labs/flux.1-schnell,black-forest-labs/flux.1-dev"),
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
