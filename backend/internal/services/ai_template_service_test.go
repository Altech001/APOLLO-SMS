package services

import "testing"

func TestParseAITemplate(t *testing.T) {
	t.Run("accepts JSON wrapped in a code fence", func(t *testing.T) {
		raw := "Here you go:\n```json\n{\"name\":\"Promo\",\"category\":\"marketing\",\"content\":\"Hi {name}, *20% off* today!\"}\n```"
		got, err := parseAITemplate(raw, "whatsapp", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.Category != "Marketing" || got.Channel != "whatsapp" || got.Content != "Hi {name}, *20% off* today!" {
			t.Fatalf("unexpected template: %+v", got)
		}
	})

	t.Run("falls back to requested category", func(t *testing.T) {
		got, err := parseAITemplate(`{"name":"","category":"Other","content":"Code {code}"}`, "sms", "Authentication")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.Category != "Authentication" || got.Name != "AI template" {
			t.Fatalf("unexpected template: %+v", got)
		}
	})

	t.Run("rejects output without a template", func(t *testing.T) {
		if _, err := parseAITemplate("Sorry, I can't help with that.", "sms", ""); err == nil {
			t.Fatal("expected an error")
		}
		if _, err := parseAITemplate(`{"name":"x","content":"  "}`, "sms", ""); err == nil {
			t.Fatal("expected an error for empty content")
		}
	})
}
