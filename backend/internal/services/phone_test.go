package services

import "testing"

func TestNormalizeUgandanPhone(t *testing.T) {
	cases := map[string]string{
		"0772 123 456":     "+256772123456",
		"772123456":        "+256772123456",
		"256772123456":     "+256772123456",
		"+256 772-123-456": "+256772123456",
		"00256772123456":   "+256772123456",
	}
	for input, want := range cases {
		got, err := NormalizeUgandanPhone(input)
		if err != nil || got != want {
			t.Errorf("NormalizeUgandanPhone(%q) = %q, %v; want %q", input, got, err, want)
		}
	}
	for _, input := range []string{"+254712345678", "07123", "77212345", "abc0772123456", ""} {
		if _, err := NormalizeUgandanPhone(input); err == nil {
			t.Errorf("NormalizeUgandanPhone(%q) should fail", input)
		}
	}
}
