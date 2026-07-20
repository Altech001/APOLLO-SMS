package ipgeo

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// IPDetails represents the structure of the geolocation API response.
type IPDetails struct {
	IP           string `json:"ip"`
	CountryName  string `json:"country_name"`
	StateProv    string `json:"state_prov"`
	City         string `json:"city"`
	CountryFlag  string `json:"country_flag"`
	CountryEmoji string `json:"country_emoji"`
	ISP          string `json:"isp"`
	ConnectionTy string `json:"connection_type"`
	Organization string `json:"organization"`
}

// Client is a wrapper for the Geolocation API.
type Client struct {
	apiKey string
}

// NewClient creates a new IP Geolocation client.
func NewClient(apiKey string) *Client {
	return &Client{apiKey: apiKey}
}

// GetDetails resolves an IP address to geolocation and ISP network data.
func (c *Client) GetDetails(ip string) (*IPDetails, error) {
	// If local loopback or private IP, use the provided sample IP for testing/mocking
	trimmed := strings.TrimSpace(ip)
	if trimmed == "127.0.0.1" || trimmed == "::1" || trimmed == "localhost" || trimmed == "" {
		trimmed = "102.209.109.157" // User's Kampala test IP
	}

	apiURL := fmt.Sprintf("https://api.ipgeolocation.io/ipgeo?apiKey=%s&ip=%s", url.QueryEscape(c.apiKey), url.QueryEscape(trimmed))

	httpClient := &http.Client{
		Timeout: 5 * time.Second,
	}

	resp, err := httpClient.Get(apiURL)
	if err != nil {
		return nil, fmt.Errorf("ipgeo api call failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ipgeo api returned HTTP status %d", resp.StatusCode)
	}

	var details IPDetails
	if err := json.NewDecoder(resp.Body).Decode(&details); err != nil {
		return nil, fmt.Errorf("failed to decode ipgeo response: %w", err)
	}

	// Double check fallback values if empty
	if details.CountryName == "" {
		details.CountryName = "Unknown Country"
	}
	if details.ISP == "" {
		details.ISP = "Unknown ISP"
	}
	if details.ConnectionTy == "" {
		details.ConnectionTy = "Unknown Connection"
	}

	return &details, nil
}

// ParseUserAgent extracts human-readable device/browser/OS info from user agent string.
func ParseUserAgent(ua string) string {
	if ua == "" {
		return "Unknown Device"
	}

	// Detect OS
	os := "Unknown OS"
	if strings.Contains(ua, "Windows") {
		os = "Windows"
	} else if strings.Contains(ua, "Android") {
		os = "Android"
	} else if strings.Contains(ua, "iPhone") {
		os = "iPhone"
	} else if strings.Contains(ua, "iPad") {
		os = "iPad"
	} else if strings.Contains(ua, "Macintosh") || strings.Contains(ua, "Mac OS X") {
		os = "macOS"
	} else if strings.Contains(ua, "Linux") {
		os = "Linux"
	}

	// Detect Browser
	browser := "Browser"
	if strings.Contains(ua, "Firefox") {
		browser = "Firefox"
	} else if strings.Contains(ua, "OPR") || strings.Contains(ua, "Opera") {
		browser = "Opera"
	} else if strings.Contains(ua, "Edg") {
		browser = "Edge"
	} else if strings.Contains(ua, "Chrome") {
		browser = "Chrome"
	} else if strings.Contains(ua, "Safari") {
		browser = "Safari"
	}

	return fmt.Sprintf("%s on %s", browser, os)
}
