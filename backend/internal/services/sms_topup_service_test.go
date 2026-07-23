package services

import (
	"testing"

	"backend/internal/models"
)

func TestValidateTransferRequest(t *testing.T) {
	t.Run("rejects self transfer", func(t *testing.T) {
		service := &SMSTopupService{}
		err := service.validateTransferRequest(models.User{ID: 1, SMSBalance: 10}, models.User{ID: 1}, 5)
		if err == nil {
			t.Fatal("expected self-transfer to be rejected")
		}
	})

	t.Run("rejects insufficient balance", func(t *testing.T) {
		service := &SMSTopupService{}
		err := service.validateTransferRequest(models.User{ID: 1, SMSBalance: 4}, models.User{ID: 2}, 5)
		if err == nil {
			t.Fatal("expected insufficient balance to be rejected")
		}
	})

	t.Run("accepts valid transfer", func(t *testing.T) {
		service := &SMSTopupService{}
		err := service.validateTransferRequest(models.User{ID: 1, SMSBalance: 10}, models.User{ID: 2}, 5)
		if err != nil {
			t.Fatalf("expected valid transfer to succeed, got %v", err)
		}
	})
}
