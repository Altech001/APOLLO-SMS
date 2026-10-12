package services

import (
	"errors"
	"regexp"
	"strings"
)

var ugandanPhoneInput = regexp.MustCompile(`^[+0-9\s().-]+$`)

// NormalizeUgandanPhone accepts common Ugandan input forms and returns E.164.
// Examples: 0772123456, 772123456, 256772123456, +256 772 123 456.
// The application sends only to Ugandan numbers, so other country codes and
// incomplete numbers are rejected instead of being silently rewritten.
func NormalizeUgandanPhone(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" || !ugandanPhoneInput.MatchString(value) {
		return "", errors.New("enter a valid Ugandan phone number")
	}

	digits := make([]byte, 0, len(value))
	for i := 0; i < len(value); i++ {
		if value[i] >= '0' && value[i] <= '9' {
			digits = append(digits, value[i])
		}
	}
	if len(digits) == 0 {
		return "", errors.New("enter a valid Ugandan phone number")
	}

	if strings.HasPrefix(value, "+") {
		if !strings.HasPrefix(string(digits), "256") {
			return "", errors.New("only Ugandan phone numbers are supported")
		}
	} else if strings.HasPrefix(string(digits), "00") {
		if !strings.HasPrefix(string(digits[2:]), "256") {
			return "", errors.New("only Ugandan phone numbers are supported")
		}
		digits = digits[2:]
	}

	subscriber := string(digits)
	switch {
	case strings.HasPrefix(subscriber, "256"):
		subscriber = subscriber[3:]
	case strings.HasPrefix(subscriber, "0"):
		subscriber = subscriber[1:]
	}

	// Uganda's national numbers are nine digits after the country code. The
	// first digit range keeps short numbers and foreign-looking values out.
	if len(subscriber) != 9 || subscriber[0] < '2' || subscriber[0] > '7' {
		return "", errors.New("enter a complete Ugandan phone number, for example 0772 123 456")
	}
	return "+256" + subscriber, nil
}
