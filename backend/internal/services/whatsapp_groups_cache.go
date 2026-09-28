package services

import (
	"context"
	"fmt"
	"sync"
	"time"

	"backend/internal/models"
)

const (
	// Group lists change rarely and every fetch is a round-trip to WhatsApp from the user's
	// number, so results are cached and forced refreshes are throttled per number.
	whatsAppGroupsCacheTTL     = 30 * time.Minute
	whatsAppGroupsMinRefresh   = 60 * time.Second
	whatsAppGroupsRedisPrefix  = "whatsapp:groups:"
	whatsAppGroupsRedisTimeout = 2 * time.Second
)

type cachedWhatsAppGroups struct {
	Groups    []models.WhatsAppGroupResponse `json:"groups"`
	FetchedAt time.Time                      `json:"fetched_at"`
}

// whatsAppGroupsCache stores group lists in Redis, falling back to process memory when
// Redis is unavailable. A per-account lock makes concurrent requests share one fetch.
type whatsAppGroupsCache struct {
	redis *RedisService

	mu    sync.Mutex
	local map[uint]cachedWhatsAppGroups
	locks map[uint]*sync.Mutex
}

func newWhatsAppGroupsCache(redis *RedisService) *whatsAppGroupsCache {
	return &whatsAppGroupsCache{
		redis: redis,
		local: make(map[uint]cachedWhatsAppGroups),
		locks: make(map[uint]*sync.Mutex),
	}
}

func (c *whatsAppGroupsCache) redisActive() bool {
	return c.redis != nil && c.redis.IsActive()
}

func whatsAppGroupsKey(accountID uint) string {
	return fmt.Sprintf("%s%d", whatsAppGroupsRedisPrefix, accountID)
}

// lock serialises fetches for one account so parallel requests don't each hit WhatsApp.
func (c *whatsAppGroupsCache) lock(accountID uint) func() {
	c.mu.Lock()
	l, ok := c.locks[accountID]
	if !ok {
		l = &sync.Mutex{}
		c.locks[accountID] = l
	}
	c.mu.Unlock()
	l.Lock()
	return l.Unlock
}

func (c *whatsAppGroupsCache) get(accountID uint) (cachedWhatsAppGroups, bool) {
	if c.redisActive() {
		ctx, cancel := context.WithTimeout(context.Background(), whatsAppGroupsRedisTimeout)
		defer cancel()
		var entry cachedWhatsAppGroups
		if err := c.redis.Get(ctx, whatsAppGroupsKey(accountID), &entry); err == nil {
			return entry, true
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.local[accountID]
	if ok && time.Since(entry.FetchedAt) > whatsAppGroupsCacheTTL {
		delete(c.local, accountID)
		return cachedWhatsAppGroups{}, false
	}
	return entry, ok
}

func (c *whatsAppGroupsCache) set(accountID uint, entry cachedWhatsAppGroups) {
	if c.redisActive() {
		ctx, cancel := context.WithTimeout(context.Background(), whatsAppGroupsRedisTimeout)
		defer cancel()
		if err := c.redis.Set(ctx, whatsAppGroupsKey(accountID), entry, whatsAppGroupsCacheTTL); err == nil {
			return
		}
	}

	c.mu.Lock()
	c.local[accountID] = entry
	c.mu.Unlock()
}

func (c *whatsAppGroupsCache) invalidate(accountID uint) {
	if c.redisActive() {
		ctx, cancel := context.WithTimeout(context.Background(), whatsAppGroupsRedisTimeout)
		defer cancel()
		_ = c.redis.Delete(ctx, whatsAppGroupsKey(accountID))
	}

	c.mu.Lock()
	delete(c.local, accountID)
	c.mu.Unlock()
}
