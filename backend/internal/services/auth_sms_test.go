package services

import (
	"encoding/json"
	"testing"
	"time"

	"backend/internal/config"
	"backend/internal/models"
)

func TestNormalizePhone(t *testing.T) {
	cases := map[string]string{
		"+256 712 345 678":  "+256712345678",
		"0712345678":        "+256712345678",
		"256712345678":      "+256712345678",
		"00254712345678":    "+254712345678",
		"+1 (415) 555-0100": "+14155550100",
	}
	for in, want := range cases {
		got, err := NormalizePhone(in)
		if err != nil || got != want {
			t.Errorf("NormalizePhone(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "+256", "abc", "+0712345678"} {
		if _, err := NormalizePhone(bad); err == nil {
			t.Errorf("NormalizePhone(%q) should fail", bad)
		}
	}
}

func TestMaskPhone(t *testing.T) {
	if got := MaskPhone("+256712345678"); got != "+2567•••••678" {
		t.Fatalf("MaskPhone = %q", got)
	}
}

func TestVerificationTicketRoundTripAndIsolation(t *testing.T) {
	s := &AuthService{cfg: &config.Config{JWTSecret: "secret"}}
	ticket, err := s.issueVerificationTicket(&models.User{ID: 7})
	if err != nil {
		t.Fatal(err)
	}
	// A session JWT signed with the plain secret must never be accepted as a ticket.
	session, _ := s.generateJWT(&models.User{ID: 7}, "sid")
	if _, err := s.ticketUserID(session); err == nil {
		t.Fatal("session token accepted as verification ticket")
	}
	if sub, err := s.ticketUserID(ticket); err != nil || sub != 7 {
		t.Fatalf("ticket parse = %d, %v", sub, err)
	}
}

func TestHashAuthCodeBindsUserAndPurpose(t *testing.T) {
	s := &AuthService{cfg: &config.Config{JWTSecret: "secret"}}
	base := s.hashAuthCode(1, models.AuthPurposeReset, "123456")
	if base == s.hashAuthCode(2, models.AuthPurposeReset, "123456") || base == s.hashAuthCode(1, models.AuthPurposeVerify, "123456") {
		t.Fatal("code hash must differ per user and purpose")
	}
}

func TestATSoftFailure(t *testing.T) {
	parse := func(s string) interface{} {
		var v interface{}
		_ = json.Unmarshal([]byte(s), &v)
		return v
	}
	allFailed := `{"SMSMessageData":{"Message":"Sent to 0/1","Recipients":[{"status":"InsufficientBalance","statusCode":405}]}}`
	if atSoftFailure(parse(allFailed), []byte(allFailed)) == nil {
		t.Fatal("InsufficientBalance for every recipient must fail over")
	}
	partial := `{"SMSMessageData":{"Recipients":[{"status":"Success"},{"status":"InvalidPhoneNumber"}]}}`
	if err := atSoftFailure(parse(partial), []byte(partial)); err != nil {
		t.Fatalf("partial success must not fail over (would resend): %v", err)
	}
}

func TestJulySMSSoftFailure(t *testing.T) {
	body := `{"success":false,"message":"Insufficient balance"}`
	var v interface{}
	_ = json.Unmarshal([]byte(body), &v)
	if julySMSSoftFailure(v, []byte(body)) == nil {
		t.Fatal("success:false must fail over")
	}
	ok := `{"success":true,"data":{"id":"x"}}`
	_ = json.Unmarshal([]byte(ok), &v)
	if err := julySMSSoftFailure(v, []byte(ok)); err != nil {
		t.Fatal(err)
	}
}

func TestProviderOrderFailover(t *testing.T) {
	s := &SMSConfigService{}
	cfg := &models.SMSConfig{
		ActiveProvider:      models.SMSProviderJulySMS,
		JulySMSClientID:     "id",
		JulySMSClientSecret: "enc",
		ATUsername:          "user",
		ATAPIKey:            "enc",
	}
	if got := s.providerOrder(cfg); len(got) != 2 || got[0] != models.SMSProviderJulySMS || got[1] != models.SMSProviderAfricasTalking {
		t.Fatalf("order = %v", got)
	}
	s.markProviderFailed(models.SMSProviderJulySMS)
	if got := s.providerOrder(cfg); got[0] != models.SMSProviderAfricasTalking || got[1] != models.SMSProviderJulySMS {
		t.Fatalf("recently failed provider must go last, got %v", got)
	}
	s.failedAt[models.SMSProviderJulySMS] = time.Now().Add(-2 * providerFailureCooldown)
	if got := s.providerOrder(cfg); got[0] != models.SMSProviderJulySMS {
		t.Fatalf("provider should be preferred again after cooldown, got %v", got)
	}
	if got := s.providerOrder(&models.SMSConfig{ActiveProvider: models.SMSProviderLocal}); len(got) != 1 || got[0] != models.SMSProviderLocal {
		t.Fatalf("local provider must not fail over, got %v", got)
	}
}
