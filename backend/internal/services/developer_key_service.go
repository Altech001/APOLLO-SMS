package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"backend/internal/models"
	"backend/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const smsRedisQueueKey = "queue:sms_jobs"

type DeveloperKeyService struct {
	db           *gorm.DB
	repo         *repository.DeveloperKeyRepository
	userRepo     *repository.UserRepository
	configRepo   *repository.SMSConfigRepository
	notifService *NotificationService
	redisService *RedisService
}

func NewDeveloperKeyService(
	db *gorm.DB,
	repo *repository.DeveloperKeyRepository,
	userRepo *repository.UserRepository,
	configRepo *repository.SMSConfigRepository,
	notifService *NotificationService,
	redisService *RedisService,
) *DeveloperKeyService {
	return &DeveloperKeyService{
		db:           db,
		repo:         repo,
		userRepo:     userRepo,
		configRepo:   configRepo,
		notifService: notifService,
		redisService: redisService,
	}
}

// GenerateRandomKey creates a random secure API key prefixed with luco_live_.
func GenerateRandomKey() (string, error) {
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return "luco_live_" + hex.EncodeToString(bytes), nil
}

// HashKey computes SHA-256 hash of the API key.
func HashKey(key string) string {
	hash := sha256.Sum256([]byte(key))
	return hex.EncodeToString(hash[:])
}

// CreateKey creates a developer key for a user.
func (s *DeveloperKeyService) CreateKey(userID uint, req *models.CreateDeveloperKeyRequest) (*models.CreateDeveloperKeyResponse, error) {
	rawKey, err := GenerateRandomKey()
	if err != nil {
		return nil, fmt.Errorf("failed to generate key: %w", err)
	}

	hash := HashKey(rawKey)
	masked := "luco_live_****" + rawKey[len(rawKey)-6:]

	key := &models.DeveloperKey{
		UserID:    userID,
		Name:      req.Name,
		KeyHash:   hash,
		MaskedKey: masked,
		IsActive:  true,
	}

	if err := s.repo.Create(key); err != nil {
		return nil, fmt.Errorf("failed to save developer key: %w", err)
	}

	return &models.CreateDeveloperKeyResponse{
		ID:        key.ID,
		Name:      key.Name,
		RawKey:    rawKey,
		MaskedKey: masked,
		CreatedAt: key.CreatedAt,
	}, nil
}

// GetKeysForUser lists all developer keys of a user.
func (s *DeveloperKeyService) GetKeysForUser(userID uint) ([]models.DeveloperKey, error) {
	return s.repo.FindByUserID(userID)
}

// RevokeKey revokes/deletes a key.
func (s *DeveloperKeyService) RevokeKey(id uint, userID uint) error {
	return s.repo.Delete(id, userID)
}

// ValidateKey validates a raw API key and returns the associated DeveloperKey.
func (s *DeveloperKeyService) ValidateKey(rawKey string) (*models.DeveloperKey, error) {
	hash := HashKey(rawKey)
	key, err := s.repo.FindByHash(hash)
	if err != nil {
		return nil, errors.New("invalid or expired developer key")
	}

	// Update last used timestamp (async/fire-and-forget to avoid blocking requests)
	go func() {
		_ = s.repo.UpdateLastUsed(key.ID)
	}()

	return key, nil
}

// ── Gateway Sending & Job Enqueuing ─────────────────────────────────────────

// EnqueueGatewaySMS validates credit requirements, deducts balance, and writes pending SMS jobs in one transaction.
func (s *DeveloperKeyService) EnqueueGatewaySMS(user *models.User, req *models.GatewaySendSMSRequest) (*models.GatewaySendSMSResponse, error) {
	// Determine all unique recipients
	phonesMap := make(map[string]bool)
	if phone := strings.TrimSpace(req.Phone); phone != "" {
		phonesMap[phone] = true
	}
	for _, p := range req.Phones {
		if phone := strings.TrimSpace(p); phone != "" {
			phonesMap[phone] = true
		}
	}

	if len(phonesMap) == 0 {
		return nil, errors.New("at least one phone number is required")
	}

	// Calculate segments and total cost
	msgLen := len(req.Message)
	segments := 1
	if msgLen > 0 {
		segments = int(math.Ceil(float64(msgLen) / 160.0))
	}
	cost := segments * len(phonesMap)
	provider := models.SMSProviderLocal
	pricePerSMS := 31
	if cfg, err := s.configRepo.Get(); err == nil {
		if cfg.ActiveProvider != "" {
			provider = cfg.ActiveProvider
		}
		if cfg.CostPerSegment > 0 {
			pricePerSMS = cfg.CostPerSegment
		}
	}

	var jobGroupID string
	var queuedJobIDs []uint

	// Perform user debit and job registration atomically
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var dbUser models.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&dbUser, user.ID).Error; err != nil {
			return errors.New("user not found")
		}

		if dbUser.SMSBalance < cost {
			return fmt.Errorf("insufficient SMS balance. Required: %d segments, Available: %d credits", cost, dbUser.SMSBalance)
		}

		// Deduct user balance
		dbUser.SMSBalance -= cost
		if err := tx.Save(&dbUser).Error; err != nil {
			return fmt.Errorf("failed to deduct SMS balance: %w", err)
		}

		userID := dbUser.ID
		debit := &models.PaymentTransaction{
			UserID:      &userID,
			Type:        models.PaymentTypeSMSDebit,
			Status:      models.PaymentStatusCompleted,
			AmountUGX:   -(cost * pricePerSMS),
			SMSCredits:  -cost,
			PricePerSMS: pricePerSMS,
			Country:     "UG",
			Method:      "sms_balance",
			Provider:    provider,
			Reference:   uuid.NewString(),
			Description: fmt.Sprintf("SMS send queued: %d recipient(s), %d segment(s) each", len(phonesMap), segments),
		}
		now := time.Now()
		debit.CompletedAt = &now
		if err := tx.Create(debit).Error; err != nil {
			return fmt.Errorf("failed to record SMS debit transaction: %w", err)
		}

		// Create SMS jobs
		jobs := make([]models.SMSJob, 0, len(phonesMap))
		for p := range phonesMap {
			jobs = append(jobs, models.SMSJob{
				UserID:   user.ID,
				Phone:    p,
				Message:  req.Message,
				Segments: segments,
				Credits:  segments,
				Status:   "pending",
				Attempts: 0,
			})
		}

		if err := s.repo.CreateJobsWithTx(tx, jobs); err != nil {
			return fmt.Errorf("failed to enqueue SMS jobs: %w", err)
		}

		// Use the first job ID or a combined identifier as jobGroupID
		if len(jobs) > 0 {
			jobGroupID = fmt.Sprintf("grp_%d", jobs[0].ID)
			queuedJobIDs = make([]uint, 0, len(jobs))
			messages := make([]models.SMSMessage, 0, len(jobs))
			logs := make([]models.SMSDeliveryLog, 0, len(jobs))
			nowText := time.Now().Format(time.RFC3339)
			for _, job := range jobs {
				queuedJobIDs = append(queuedJobIDs, job.ID)
				jobID := job.ID
				messageID := fmt.Sprintf("sms_%d", job.ID)
				messages = append(messages, models.SMSMessage{
					UserID:               user.ID,
					SMSJobID:             &jobID,
					PaymentTransactionID: &debit.ID,
					Provider:             provider,
					MessageID:            messageID,
					Phone:                job.Phone,
					Message:              job.Message,
					Segments:             job.Segments,
					Credits:              job.Credits,
					Status:               models.SMSMessageStatusQueued,
				})
				logs = append(logs, models.SMSDeliveryLog{
					Provider:   provider,
					MessageID:  messageID,
					Phone:      job.Phone,
					Status:     models.SMSMessageStatusQueued,
					SentAt:     nowText,
					RawPayload: fmt.Sprintf(`{"job_id":%d,"event":"queued"}`, job.ID),
				})
			}
			if err := s.repo.CreateSMSMessagesWithTx(tx, messages); err != nil {
				return fmt.Errorf("failed to save SMS message records: %w", err)
			}
			if err := s.repo.CreateDeliveryLogsWithTx(tx, logs); err != nil {
				return fmt.Errorf("failed to save SMS delivery logs: %w", err)
			}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	s.pushJobsToRedisQueue(queuedJobIDs)
	if s.notifService != nil {
		s.notifService.Notify(user.ID, "SMS Queued", fmt.Sprintf("%d SMS message(s) queued. %d credit(s) deducted.", len(phonesMap), cost), "info")
	}

	return &models.GatewaySendSMSResponse{
		Success:    true,
		Message:    fmt.Sprintf("Successfully enqueued %d SMS messages. Cost: %d credits", len(phonesMap), cost),
		JobGroupID: jobGroupID,
	}, nil
}

func (s *DeveloperKeyService) pushJobsToRedisQueue(jobIDs []uint) {
	if s.redisService == nil || !s.redisService.IsActive() || len(jobIDs) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	for _, id := range jobIDs {
		_ = s.redisService.PushQueue(ctx, smsRedisQueueKey, id)
	}
}

// GetFailedJobs retrieves failed SMS jobs for admin inspection.
func (s *DeveloperKeyService) GetFailedJobs(limit int) ([]models.SMSJob, error) {
	return s.repo.FindFailedJobs(limit)
}

func dashboardRangeStart(rangeName string) time.Time {
	now := time.Now()
	switch rangeName {
	case "week":
		return now.AddDate(0, 0, -7)
	case "month":
		return now.AddDate(0, -1, 0)
	case "year":
		return now.AddDate(-1, 0, 0)
	default:
		y, m, d := now.Date()
		return time.Date(y, m, d, 0, 0, 0, 0, now.Location())
	}
}

func messageTimestamp(msg models.SMSMessage) time.Time {
	if msg.SentAt != nil {
		return *msg.SentAt
	}
	return msg.CreatedAt
}

func isSuccessStatus(status string) bool {
	return status == models.SMSMessageStatusSent || status == models.SMSMessageStatusDelivered
}

func isQueuedStatus(status string) bool {
	return status == models.SMSMessageStatusQueued || status == models.SMSMessageStatusProcessing
}

// ListUserMessages returns SMS messages for the authenticated user.
func (s *DeveloperKeyService) ListUserMessages(userID uint, limit int) ([]models.SMSMessageListItem, error) {
	if limit <= 0 {
		limit = 200
	}
	messages, err := s.repo.FindMessagesByUserID(userID, limit)
	if err != nil {
		return nil, err
	}
	items := make([]models.SMSMessageListItem, 0, len(messages))
	for _, message := range messages {
		items = append(items, message.ToListItem())
	}
	return items, nil
}

// GetUserSMSDashboard builds dashboard stats from persisted SMS messages.
func (s *DeveloperKeyService) GetUserSMSDashboard(userID uint, rangeName string) (*models.SMSDashboardStats, error) {
	rangeStart := dashboardRangeStart(rangeName)
	heatmapStart := time.Now().AddDate(0, 0, -83)

	messages, err := s.repo.FindMessagesByUserIDSince(userID, heatmapStart, 0)
	if err != nil {
		return nil, err
	}

	pendingCount, err := s.repo.CountPendingMessagesByUser(userID)
	if err != nil {
		return nil, err
	}

	stats := &models.SMSDashboardStats{
		Chart:   make([]models.SMSDashboardChartPoint, 7),
		Heatmap: make([]models.SMSDashboardHeatmapCell, 84),
		Recent:  make([]models.SMSMessageListItem, 0, 10),
	}

	for i := 0; i < 7; i++ {
		day := time.Now().AddDate(0, 0, -(6 - i))
		stats.Chart[i] = models.SMSDashboardChartPoint{
			Date: day.Format("Jan 2"),
		}
	}

	for i := 0; i < 84; i++ {
		stats.Heatmap[i] = models.SMSDashboardHeatmapCell{Day: i}
	}

	recentMessages, err := s.repo.FindMessagesByUserID(userID, 10)
	if err != nil {
		return nil, err
	}
	for _, message := range recentMessages {
		stats.Recent = append(stats.Recent, message.ToListItem())
	}

	rangeMessages, err := s.repo.FindMessagesByUserIDSince(userID, rangeStart, 0)
	if err != nil {
		return nil, err
	}

	var rangeTotal, rangeSuccess, rangeFailed int
	for _, message := range rangeMessages {
		rangeTotal++
		if isSuccessStatus(message.Status) {
			rangeSuccess++
		} else if message.Status == models.SMSMessageStatusFailed {
			rangeFailed++
		}
	}

	stats.SuccessCount = rangeSuccess
	stats.FailedCount = rangeFailed
	stats.TotalSent = rangeTotal
	stats.QueuedCount = int(pendingCount)
	if rangeTotal > 0 {
		stats.DeliveryRate = math.Round((float64(rangeSuccess)/float64(rangeTotal))*1000) / 10
	} else {
		stats.DeliveryRate = 100
	}

	now := time.Now()
	for _, message := range messages {
		ts := messageTimestamp(message)
		dayIndex := int(now.Sub(time.Date(ts.Year(), ts.Month(), ts.Day(), 0, 0, 0, 0, ts.Location())).Hours() / 24)
		if dayIndex < 0 || dayIndex >= 84 {
			continue
		}
		cell := &stats.Heatmap[83-dayIndex]
		cell.Count++
	}

	for i := range stats.Heatmap {
		count := stats.Heatmap[i].Count
		level := 0
		switch {
		case count > 10:
			level = 4
		case count > 5:
			level = 3
		case count > 2:
			level = 2
		case count > 0:
			level = 1
		}
		stats.Heatmap[i].Level = level
	}

	for i := 0; i < 7; i++ {
		dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, -(6 - i))
		dayEnd := dayStart.Add(24 * time.Hour)
		for _, message := range messages {
			ts := messageTimestamp(message)
			if ts.Before(dayStart) || !ts.Before(dayEnd) {
				continue
			}
			if message.Status == models.SMSMessageStatusFailed {
				stats.Chart[i].Failed++
			} else if isSuccessStatus(message.Status) {
				stats.Chart[i].Delivered++
			}
		}
	}

	return stats, nil
}

// ── Background Queue Worker ──────────────────────────────────────────────────

// StartQueueWorker spins up a background worker goroutine to process pending jobs in batches.
func (s *DeveloperKeyService) StartQueueWorker(smsConfigService *SMSConfigService) {
	go func() {
		fmt.Println("⚙️  Starting SMS queue worker...")
		for {
			// Query the active batch size from config
			batchSize := 100
			if cfg, err := s.configRepo.Get(); err == nil && cfg.QueueBatchSize > 0 {
				batchSize = cfg.QueueBatchSize
			}

			jobs, err := s.getNextJobsForProcessing(batchSize)
			if err != nil || len(jobs) == 0 {
				// No jobs available or db error, wait and try again
				time.Sleep(1 * time.Second)
				continue
			}

			// Group jobs by Message so that we can send a single bulk SMS request to the gateway
			type groupKey struct {
				UserID  uint
				Message string
			}
			groups := make(map[groupKey][]models.SMSJob)
			for _, job := range jobs {
				key := groupKey{UserID: job.UserID, Message: job.Message}
				groups[key] = append(groups[key], job)
			}

			// Process each grouped message in bulk
			for key, groupJobs := range groups {
				var phones []string
				var jobIDs []uint
				for _, j := range groupJobs {
					phones = append(phones, j.Phone)
					jobIDs = append(jobIDs, j.ID)
				}

				sendReq := &models.SendSMSRequest{
					Phones:  phones,
					Message: key.Message,
				}

				provider := models.SMSProviderLocal
				if cfg, err := s.configRepo.Get(); err == nil && cfg.ActiveProvider != "" {
					provider = cfg.ActiveProvider
				}
				_ = s.repo.UpdateMessagesStatusByJobIDs(jobIDs, models.SMSMessageStatusProcessing, "", "", "")

				sendResp, sendErr := smsConfigService.SendSMS(sendReq)
				if sendErr != nil {
					fmt.Printf("❌ Failed to send bulk SMS to %d recipients: %v\n", len(phones), sendErr)
					_ = s.repo.UpdateJobsStatus(jobIDs, "failed", sendErr.Error())
					_ = s.repo.UpdateMessagesStatusByJobIDs(jobIDs, models.SMSMessageStatusFailed, provider, sendErr.Error(), "")
					_ = s.repo.CreateDeliveryLogsForJobs(jobIDs, models.SMSMessageStatusFailed, provider, sendErr.Error())
				} else {
					_ = s.repo.UpdateJobsStatus(jobIDs, "completed", "")
					rawPayload := marshalSendSMSResponse(sendResp)
					_ = s.repo.UpdateMessagesStatusByJobIDs(jobIDs, models.SMSMessageStatusSent, sendResp.Provider, "", rawPayload)
					_ = s.repo.CreateDeliveryLogsForJobs(jobIDs, models.SMSMessageStatusSent, sendResp.Provider, rawPayload)
				}
			}
		}
	}()
}

func marshalSendSMSResponse(resp *models.SendSMSResponse) string {
	if resp == nil {
		return ""
	}
	b, err := json.Marshal(resp)
	if err != nil {
		return ""
	}
	return string(b)
}

func (s *DeveloperKeyService) getNextJobsForProcessing(batchSize int) ([]models.SMSJob, error) {
	if s.redisService != nil && s.redisService.IsActive() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		items, err := s.redisService.PopQueueBatch(ctx, smsRedisQueueKey, batchSize)
		if err == nil && len(items) > 0 {
			ids := make([]uint, 0, len(items))
			for _, item := range items {
				id64, parseErr := strconv.ParseUint(item, 10, 32)
				if parseErr == nil {
					ids = append(ids, uint(id64))
				}
			}
			if len(ids) > 0 {
				jobs, lockErr := s.repo.GetJobsByIDsForProcessing(ids)
				if lockErr == nil && len(jobs) > 0 {
					return jobs, nil
				}
			}
		}
	}

	return s.repo.GetNextJobsBatchForProcessing(batchSize)
}
