package repository

import (
	"backend/internal/models"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type DeveloperKeyRepository struct {
	db *gorm.DB
}

func NewDeveloperKeyRepository(db *gorm.DB) *DeveloperKeyRepository {
	return &DeveloperKeyRepository{db: db}
}

// Create inserts a new developer key.
func (r *DeveloperKeyRepository) Create(key *models.DeveloperKey) error {
	return r.db.Create(key).Error
}

// FindByUserID lists all developer keys for a user.
func (r *DeveloperKeyRepository) FindByUserID(userID uint) ([]models.DeveloperKey, error) {
	var keys []models.DeveloperKey
	err := r.db.Where("user_id = ?", userID).Find(&keys).Error
	return keys, err
}

// FindByHash retrieves an active developer key by its SHA-256 hash.
func (r *DeveloperKeyRepository) FindByHash(hash string) (*models.DeveloperKey, error) {
	var key models.DeveloperKey
	err := r.db.Preload("User").Where("key_hash = ? AND is_active = ?", hash, true).First(&key).Error
	if err != nil {
		return nil, err
	}
	return &key, nil
}

// UpdateLastUsed updates the last used timestamp of a key.
func (r *DeveloperKeyRepository) UpdateLastUsed(id uint) error {
	now := time.Now()
	return r.db.Model(&models.DeveloperKey{}).Where("id = ?", id).Update("last_used_at", &now).Error
}

// Delete soft-deletes a developer key.
func (r *DeveloperKeyRepository) Delete(id uint, userID uint) error {
	return r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.DeveloperKey{}).Error
}

// ── SMS Queue/Jobs ──────────────────────────────────────────────────────────

// CreateJob inserts a new SMS job.
func (r *DeveloperKeyRepository) CreateJob(job *models.SMSJob) error {
	return r.db.Create(job).Error
}

// CreateJobsWithTx inserts multiple jobs atomically using an active transaction.
func (r *DeveloperKeyRepository) CreateJobsWithTx(tx *gorm.DB, jobs []models.SMSJob) error {
	return tx.Create(&jobs).Error
}

// CreateSMSMessagesWithTx inserts auditable SMS message records atomically.
func (r *DeveloperKeyRepository) CreateSMSMessagesWithTx(tx *gorm.DB, messages []models.SMSMessage) error {
	if len(messages) == 0 {
		return nil
	}
	return tx.Create(&messages).Error
}

// CreateDeliveryLogsWithTx inserts delivery log records atomically.
func (r *DeveloperKeyRepository) CreateDeliveryLogsWithTx(tx *gorm.DB, logs []models.SMSDeliveryLog) error {
	if len(logs) == 0 {
		return nil
	}
	return tx.Create(&logs).Error
}

// GetNextJobsBatchForProcessing locks and retrieves up to batchSize pending SMS jobs.
// Uses SELECT ... FOR UPDATE SKIP LOCKED to ensure concurrency safety.
func (r *DeveloperKeyRepository) GetNextJobsBatchForProcessing(batchSize int) ([]models.SMSJob, error) {
	var jobs []models.SMSJob
	err := r.db.Transaction(func(tx *gorm.DB) error {
		// Attempt to locate and lock pending jobs
		var targetIDs []uint
		err := tx.Raw("SELECT id FROM sms_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT ? FOR UPDATE SKIP LOCKED", batchSize).Scan(&targetIDs).Error
		if err != nil {
			return err
		}
		if len(targetIDs) == 0 {
			return gorm.ErrRecordNotFound
		}

		// Retrieve jobs
		if err := tx.Where("id IN ?", targetIDs).Find(&jobs).Error; err != nil {
			return err
		}

		// Update status to processing and increment attempts
		return tx.Model(&models.SMSJob{}).Where("id IN ?", targetIDs).Updates(map[string]interface{}{
			"status":     "processing",
			"attempts":   gorm.Expr("attempts + 1"),
			"updated_at": time.Now(),
		}).Error
	})

	if err != nil {
		return nil, err
	}
	return jobs, nil
}

// GetJobsByIDsForProcessing locks pending jobs by ID and marks them processing.
func (r *DeveloperKeyRepository) GetJobsByIDsForProcessing(ids []uint) ([]models.SMSJob, error) {
	if len(ids) == 0 {
		return nil, nil
	}

	var jobs []models.SMSJob
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("id IN ? AND status = ?", ids, "pending").
			Order("created_at asc").
			Find(&jobs).Error; err != nil {
			return err
		}
		if len(jobs) == 0 {
			return nil
		}

		targetIDs := make([]uint, 0, len(jobs))
		for _, job := range jobs {
			targetIDs = append(targetIDs, job.ID)
		}

		return tx.Model(&models.SMSJob{}).Where("id IN ?", targetIDs).Updates(map[string]interface{}{
			"status":     "processing",
			"attempts":   gorm.Expr("attempts + 1"),
			"updated_at": time.Now(),
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return jobs, nil
}

// UpdateJobStatus updates the status/error message of a single SMS job.
func (r *DeveloperKeyRepository) UpdateJobStatus(id uint, status string, errorMsg string) error {
	return r.db.Model(&models.SMSJob{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":        status,
		"error_message": errorMsg,
		"updated_at":    time.Now(),
	}).Error
}

// UpdateJobsStatus updates the status/error message of multiple SMS jobs in bulk.
func (r *DeveloperKeyRepository) UpdateJobsStatus(ids []uint, status string, errorMsg string) error {
	if len(ids) == 0 {
		return nil
	}
	return r.db.Model(&models.SMSJob{}).Where("id IN ?", ids).Updates(map[string]interface{}{
		"status":        status,
		"error_message": errorMsg,
		"updated_at":    time.Now(),
	}).Error
}

// UpdateMessagesStatusByJobIDs updates auditable SMS message records for matching jobs.
func (r *DeveloperKeyRepository) UpdateMessagesStatusByJobIDs(ids []uint, status string, provider string, errorMsg string, rawPayload string) error {
	if len(ids) == 0 {
		return nil
	}

	updates := map[string]interface{}{
		"status":        status,
		"error_message": errorMsg,
		"raw_response":  rawPayload,
		"updated_at":    time.Now(),
	}
	if provider != "" {
		updates["provider"] = provider
	}
	if status == models.SMSMessageStatusSent || status == models.SMSMessageStatusDelivered {
		updates["sent_at"] = time.Now()
	}
	if status == models.SMSMessageStatusDelivered {
		updates["delivered_at"] = time.Now()
	}

	return r.db.Model(&models.SMSMessage{}).Where("sms_job_id IN ?", ids).Updates(updates).Error
}

// CreateDeliveryLogsForJobs records a delivery event for each matching SMS message.
func (r *DeveloperKeyRepository) CreateDeliveryLogsForJobs(jobIDs []uint, status string, provider string, rawPayload string) error {
	if len(jobIDs) == 0 {
		return nil
	}

	var messages []models.SMSMessage
	if err := r.db.Where("sms_job_id IN ?", jobIDs).Find(&messages).Error; err != nil {
		return err
	}
	if len(messages) == 0 {
		return nil
	}

	logs := make([]models.SMSDeliveryLog, 0, len(messages))
	now := time.Now().Format(time.RFC3339)
	for _, message := range messages {
		logs = append(logs, models.SMSDeliveryLog{
			Provider:   provider,
			MessageID:  message.MessageID,
			Phone:      message.Phone,
			Status:     status,
			SentAt:     now,
			RawPayload: rawPayload,
		})
	}
	return r.db.Create(&logs).Error
}

// FindFailedJobs lists failed jobs for admin review.
func (r *DeveloperKeyRepository) FindFailedJobs(limit int) ([]models.SMSJob, error) {
	var jobs []models.SMSJob
	q := r.db.Preload("User").Where("status = ?", "failed").Order("updated_at desc")
	if limit > 0 {
		q = q.Limit(limit)
	}
	err := q.Find(&jobs).Error
	return jobs, err
}
