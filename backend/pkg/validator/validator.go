package validator

import (
	"regexp"
	"strings"
)

// IsValidPhone checks if a string looks like a valid phone number.
func IsValidPhone(phone string) bool {
	phone = strings.TrimSpace(phone)
	re := regexp.MustCompile(`^\+?[1-9]\d{6,14}$`)
	return re.MatchString(phone)
}

// IsValidEmail checks if a string looks like a valid email address.
func IsValidEmail(email string) bool {
	email = strings.TrimSpace(email)
	re := regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	return re.MatchString(email)
}

// IsNotBlank checks if a string is not empty or whitespace-only.
func IsNotBlank(s string) bool {
	return strings.TrimSpace(s) != ""
}
