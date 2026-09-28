package email

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

const resendSendURL = "https://api.resend.com/emails"

// ResendEmailRequest represents the JSON payload expected by Resend.
type ResendEmailRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
}

// ResendEmailResponse represents the JSON response returned by Resend.
type ResendEmailResponse struct {
	ID string `json:"id"`
}

// EmailSender manages sending emails via the Resend API.
type EmailSender struct {
	apiKey     string
	fromEmail  string
	httpClient *http.Client
}

// NewEmailSender creates a new EmailSender instance.
func NewEmailSender(apiKey, fromEmail string) *EmailSender {
	if strings.TrimSpace(apiKey) == "" {
		log.Println("⚠️  RESEND_API_KEY is not set: verification and password reset emails will fail")
	}
	return &EmailSender{
		apiKey:     strings.TrimSpace(apiKey),
		fromEmail:  strings.TrimSpace(fromEmail),
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// Send sends an HTML email to a single recipient, retrying transient failures (network errors,
// 429 rate limits and 5xx responses) up to three times.
func (s *EmailSender) Send(to, subject, html string) error {
	if s.apiKey == "" {
		return errors.New("email is not configured (RESEND_API_KEY missing)")
	}

	jsonBytes, err := json.Marshal(ResendEmailRequest{
		From:    s.fromEmail,
		To:      []string{to},
		Subject: subject,
		HTML:    html,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		retry, err := s.post(jsonBytes)
		if err == nil {
			return nil
		}
		lastErr = err
		if !retry {
			break
		}
		time.Sleep(time.Duration(attempt) * time.Second)
	}
	return lastErr
}

// SendAsync sends in the background and logs the outcome, for callers that must not block.
func (s *EmailSender) SendAsync(to, subject, html string) {
	go func() {
		if err := s.Send(to, subject, html); err != nil {
			log.Printf("❌ Email %q to %s failed: %v", subject, to, err)
			return
		}
		log.Printf("📧 Email %q sent to %s", subject, to)
	}()
}

// post performs one send attempt and reports whether a failure is worth retrying.
func (s *EmailSender) post(body []byte) (retry bool, err error) {
	req, err := http.NewRequest(http.MethodPost, resendSendURL, bytes.NewReader(body))
	if err != nil {
		return false, fmt.Errorf("failed to create http request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return true, fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		return false, nil
	}
	bodyBytes, _ := io.ReadAll(resp.Body)
	retry = resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500
	return retry, fmt.Errorf("resend returned status %d: %s", resp.StatusCode, string(bodyBytes))
}
