package services

import (
	"strings"
	"testing"

	"backend/internal/models"
)

func TestComposeWhatsAppText(t *testing.T) {
	rich, err := normalizeWhatsAppRich(models.WhatsAppRich{
		Header: "Weekend Juice Sale",
		Footer: "Reply STOP to opt out",
		Buttons: []models.WhatsAppButton{
			{Type: "url", Text: "Order now", Value: "juice.ug/order"},
			{Type: "call", Text: "Call us", Value: "+256 772 123 456"},
			{Type: "reply", Text: "Remind me"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	got := composeWhatsAppText("20% off all fresh juice this weekend!", rich)
	for _, want := range []string{"*Weekend Juice Sale*", "🔗 *Order now*\nhttps://juice.ug/order", "📞 *Call us*: +256772123456", "1️⃣ Remind me", "_Reply STOP to opt out_"} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in:\n%s", want, got)
		}
	}
}

func TestNormalizeWhatsAppRichRejects(t *testing.T) {
	cases := []models.WhatsAppRich{
		{ImageURL: "ftp://example.com/a.jpg"},
		{Buttons: []models.WhatsAppButton{{Type: "url", Text: "Go", Value: "not a link"}}},
		{Buttons: []models.WhatsAppButton{{Type: "call", Text: "Call", Value: "123"}}},
		{Buttons: []models.WhatsAppButton{{Type: "reply", Text: "a"}, {Type: "reply", Text: "b"}, {Type: "reply", Text: "c"}, {Type: "reply", Text: "d"}}},
	}
	for i, c := range cases {
		if _, err := normalizeWhatsAppRich(c); err == nil {
			t.Fatalf("case %d should be rejected", i)
		}
	}
}
