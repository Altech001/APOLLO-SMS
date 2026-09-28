package services

import "testing"

func TestNormalizeWhatsAppPhone(t *testing.T) {
	valid := map[string]string{
		"0700123456":       "256700123456",
		"+256 700-123-456": "256700123456",
		"256700123456":     "256700123456",
		"+14155550123":     "14155550123",
		" (0772) 123 456 ": "256772123456",
	}
	for input, want := range valid {
		got, err := normalizeWhatsAppPhone(input)
		if err != nil {
			t.Fatalf("normalizeWhatsAppPhone(%q) returned error: %v", input, err)
		}
		if got != want {
			t.Fatalf("normalizeWhatsAppPhone(%q) = %q, want %q", input, got, want)
		}
	}

	for _, input := range []string{"", "abc", "12"} {
		if _, err := normalizeWhatsAppPhone(input); err == nil {
			t.Fatalf("expected normalizeWhatsAppPhone(%q) to fail", input)
		}
	}
}
