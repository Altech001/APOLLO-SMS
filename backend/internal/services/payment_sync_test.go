package services

import (
	"encoding/json"
	"testing"

	"backend/internal/models"
)

func TestParseMarzPayFailedResponse(t *testing.T) {
	body := []byte(`{"event_type":"collection.failed","transaction":{"uuid":"a42dfee5-8579-40ff-95ee-ea56825278a3","reference":"2258b5f8-9dc1-48f1-bd9e-1bd1c43ec752","status":"failed","amount":{"formatted":"515.00","raw":"515","currency":"UGX"},"provider":"airtel","phone_number":"+256708215305","description":"test","created_at":"2026-07-21T01:45:42.000000Z","updated_at":"2026-07-21T01:45:51.000000Z"},"collection":{"provider":"airtel","phone_number":"+256708215305","amount":{"formatted":"515.00","raw":515,"currency":"UGX"},"mode":"airteluganda","provider_transaction_id":"152160420555"}}`)

	payload, err := parseMarzPayTransactionResponse(body, "2258b5f8-9dc1-48f1-bd9e-1bd1c43ec752")
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if payload.Transaction.Status != "failed" {
		t.Fatalf("expected failed status, got %q", payload.Transaction.Status)
	}
	if payload.EventType != "collection.failed" {
		t.Fatalf("expected collection.failed event, got %q", payload.EventType)
	}

	var direct models.MarzPayWebhookPayload
	if err := json.Unmarshal(body, &direct); err != nil {
		t.Fatalf("direct unmarshal error: %v", err)
	}
	if direct.Transaction.Reference == "" {
		t.Fatalf("direct unmarshal lost reference")
	}
}
