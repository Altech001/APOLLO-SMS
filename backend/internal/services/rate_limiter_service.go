package services

import (
	"sync"
	"time"
)

// RateLimiterService provides thread-safe key-based rate limiting using a sliding window algorithm.
type RateLimiterService struct {
	mu       sync.Mutex
	requests map[string][]time.Time
}

// NewRateLimiterService creates and starts the RateLimiterService with background cleanup.
func NewRateLimiterService() *RateLimiterService {
	s := &RateLimiterService{
		requests: make(map[string][]time.Time),
	}
	go s.startCleanupLoop(5 * time.Minute)
	return s
}

// IsAllowed checks if a request with key is within the limit in the given window.
func (s *RateLimiterService) IsAllowed(key string, limit int, window time.Duration) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-window)

	// Clean up old records for this key
	times := s.requests[key]
	var validTimes []time.Time
	for _, t := range times {
		if t.After(cutoff) {
			validTimes = append(validTimes, t)
		}
	}

	if len(validTimes) >= limit {
		s.requests[key] = validTimes
		return false
	}

	validTimes = append(validTimes, now)
	s.requests[key] = validTimes
	return true
}

// startCleanupLoop periodically deletes stale rate limit keys to avoid memory leaks.
func (s *RateLimiterService) startCleanupLoop(interval time.Duration) {
	ticker := time.NewTicker(interval)
	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		for key, times := range s.requests {
			var validTimes []time.Time
			for _, t := range times {
				// Keep only last 1 hour max just to be safe
				if t.After(now.Add(-1 * time.Hour)) {
					validTimes = append(validTimes, t)
				}
			}
			if len(validTimes) == 0 {
				delete(s.requests, key)
			} else {
				s.requests[key] = validTimes
			}
		}
		s.mu.Unlock()
	}
}
