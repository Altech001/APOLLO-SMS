package repository

import (
	"backend/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type PaymentRepository struct {
	db *gorm.DB
}

func NewPaymentRepository(db *gorm.DB) *PaymentRepository {
	return &PaymentRepository{db: db}
}

func (r *PaymentRepository) Create(payment *models.PaymentTransaction) error {
	return r.db.Create(payment).Error
}

func (r *PaymentRepository) FindByReference(reference string) (*models.PaymentTransaction, error) {
	var payment models.PaymentTransaction
	if err := r.db.Where("reference = ?", reference).First(&payment).Error; err != nil {
		return nil, err
	}
	return &payment, nil
}

func (r *PaymentRepository) FindByReferenceForUpdate(tx *gorm.DB, reference string) (*models.PaymentTransaction, error) {
	var payment models.PaymentTransaction
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("reference = ?", reference).First(&payment).Error; err != nil {
		return nil, err
	}
	return &payment, nil
}

func (r *PaymentRepository) List(limit int) ([]models.PaymentTransaction, error) {
	var payments []models.PaymentTransaction
	q := r.db.Order("created_at desc")
	if limit > 0 {
		q = q.Limit(limit)
	}
	err := q.Find(&payments).Error
	return payments, err
}

func (r *PaymentRepository) UsageSummary() (*models.SMSUsageSummary, error) {
	summary := &models.SMSUsageSummary{}

	if err := r.db.Model(&models.PaymentTransaction{}).Where("type = ?", models.PaymentTypeCollection).Count(&summary.DepositCount).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&models.PaymentTransaction{}).Where("type = ? AND status = ?", models.PaymentTypeCollection, models.PaymentStatusCompleted).Count(&summary.CompletedDeposits).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&models.PaymentTransaction{}).Where("type = ? AND status = ?", models.PaymentTypeCollection, models.PaymentStatusFailed).Count(&summary.FailedDeposits).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&models.PaymentTransaction{}).Where("type = ? AND status IN ?", models.PaymentTypeCollection, []string{models.PaymentStatusPending, models.PaymentStatusProcessing}).Count(&summary.ProcessingDeposits).Error; err != nil {
		return nil, err
	}

	type totalRow struct {
		TotalUGX int64
		Credits  int64
	}
	var totals totalRow
	if err := r.db.Model(&models.PaymentTransaction{}).
		Select("COALESCE(SUM(amount_ugx), 0) AS total_ugx, COALESCE(SUM(sms_credits), 0) AS credits").
		Where("type = ? AND status = ?", models.PaymentTypeCollection, models.PaymentStatusCompleted).
		Scan(&totals).Error; err != nil {
		return nil, err
	}
	summary.TotalDepositUGX = totals.TotalUGX
	summary.SMSPurchased = totals.Credits

	type balanceRow struct {
		Total int64
	}
	var balance balanceRow
	if err := r.db.Model(&models.User{}).Select("COALESCE(SUM(sms_balance), 0) AS total").Scan(&balance).Error; err != nil {
		return nil, err
	}
	summary.SMSAvailable = balance.Total
	type creditsRow struct {
		Credits int64
	}
	var used creditsRow
	if err := r.db.Model(&models.SMSJob{}).Select("COALESCE(SUM(credits), 0) AS credits").Where("status = ?", "completed").Scan(&used).Error; err != nil {
		return nil, err
	}
	summary.SMSUsed = used.Credits

	var pending creditsRow
	if err := r.db.Model(&models.SMSJob{}).Select("COALESCE(SUM(credits), 0) AS credits").Where("status IN ?", []string{"pending", "processing"}).Scan(&pending).Error; err != nil {
		return nil, err
	}
	summary.SMSPending = pending.Credits

	var failed creditsRow
	if err := r.db.Model(&models.SMSJob{}).Select("COALESCE(SUM(credits), 0) AS credits").Where("status = ?", "failed").Scan(&failed).Error; err != nil {
		return nil, err
	}
	summary.SMSFailed = failed.Credits

	return summary, nil
}
