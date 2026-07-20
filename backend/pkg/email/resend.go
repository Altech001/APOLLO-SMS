package email

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

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
	apiKey    string
	fromEmail string
}

// NewEmailSender creates a new EmailSender instance.
func NewEmailSender(apiKey, fromEmail string) *EmailSender {
	return &EmailSender{
		apiKey:    apiKey,
		fromEmail: fromEmail,
	}
}

// Send sends an HTML email to a single recipient.
func (s *EmailSender) Send(to, subject, html string) error {
	url := "https://api.resend.com/emails"
	reqPayload := ResendEmailRequest{
		From:    s.fromEmail,
		To:      []string{to},
		Subject: subject,
		HTML:    html,
	}

	jsonBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return fmt.Errorf("failed to create http request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("resend returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}
