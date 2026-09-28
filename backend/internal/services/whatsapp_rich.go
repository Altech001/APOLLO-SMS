package services

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"backend/internal/models"
)

const (
	whatsAppMaxButtons       = 3
	whatsAppMaxCaptionLength = 1024
)

var (
	whatsAppNumberEmoji = []string{"1️⃣", "2️⃣", "3️⃣"}
	nonPhoneChars       = regexp.MustCompile(`[^\d+]`)
)

// normalizeWhatsAppRich trims and validates the optional parts of a message.
func normalizeWhatsAppRich(rich models.WhatsAppRich) (models.WhatsAppRich, error) {
	out := models.WhatsAppRich{
		ImageURL: strings.TrimSpace(rich.ImageURL),
		Header:   strings.TrimSpace(rich.Header),
		Footer:   strings.TrimSpace(rich.Footer),
	}
	if out.ImageURL != "" {
		u, err := url.Parse(out.ImageURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return out, errors.New("the image link is not valid")
		}
	}
	if len([]rune(out.Header)) > 60 {
		return out, errors.New("the header can be at most 60 characters")
	}
	if len([]rune(out.Footer)) > 60 {
		return out, errors.New("the footer can be at most 60 characters")
	}
	for _, b := range rich.Buttons {
		b.Type = strings.ToLower(strings.TrimSpace(b.Type))
		b.Text = strings.TrimSpace(b.Text)
		b.Value = strings.TrimSpace(b.Value)
		if b.Text == "" {
			continue
		}
		if len([]rune(b.Text)) > 25 {
			return out, fmt.Errorf("button %q is too long (25 characters max)", b.Text)
		}
		switch b.Type {
		case "url":
			if !strings.Contains(b.Value, "://") {
				b.Value = "https://" + b.Value
			}
			if u, err := url.Parse(b.Value); err != nil || u.Host == "" || !strings.Contains(u.Host, ".") {
				return out, fmt.Errorf("button %q needs a valid link", b.Text)
			}
		case "call":
			b.Value = nonPhoneChars.ReplaceAllString(b.Value, "")
			if len(strings.TrimPrefix(b.Value, "+")) < 9 {
				return out, fmt.Errorf("button %q needs a valid phone number", b.Text)
			}
		case "reply":
			b.Value = ""
		default:
			return out, fmt.Errorf("unknown button type %q", b.Type)
		}
		if len(out.Buttons) == whatsAppMaxButtons {
			return out, fmt.Errorf("a message can have at most %d buttons", whatsAppMaxButtons)
		}
		out.Buttons = append(out.Buttons, b)
	}
	return out, nil
}

// composeWhatsAppText lays out header, body, buttons and footer as WhatsApp-formatted text.
func composeWhatsAppText(body string, rich models.WhatsAppRich) string {
	var parts []string
	if rich.Header != "" {
		parts = append(parts, "*"+rich.Header+"*")
	}
	parts = append(parts, strings.TrimSpace(body))

	var actions, replies []string
	for _, b := range rich.Buttons {
		switch b.Type {
		case "url":
			actions = append(actions, "🔗 *"+b.Text+"*\n"+b.Value)
		case "call":
			actions = append(actions, "📞 *"+b.Text+"*: "+b.Value)
		case "reply":
			replies = append(replies, b.Text)
		}
	}
	if len(actions) > 0 {
		parts = append(parts, strings.Join(actions, "\n\n"))
	}
	if len(replies) > 0 {
		lines := []string{"_Reply with a number:_"}
		for i, r := range replies {
			lines = append(lines, whatsAppNumberEmoji[i]+" "+r)
		}
		parts = append(parts, strings.Join(lines, "\n"))
	}
	if rich.Footer != "" {
		parts = append(parts, "_"+rich.Footer+"_")
	}
	return strings.Join(parts, "\n\n")
}
