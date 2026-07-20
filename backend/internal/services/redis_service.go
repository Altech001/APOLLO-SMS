package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"backend/internal/config"

	"github.com/redis/go-redis/v9"
)

type RedisService struct {
	client *redis.Client
	active bool
}

func NewRedisService(cfg *config.Config) *RedisService {
	if cfg.RedisAddr == "" {
		log.Println("Redis not configured; running with database fallback only")
		return &RedisService{active: false}
	}

	client := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Username: cfg.RedisUsername,
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()

	active := true
	if err := client.Ping(ctx).Err(); err != nil {
		log.Printf("⚠️  Redis connection failed (running in fallback mode): %v\n", err)
		active = false
	} else {
		log.Println("✅ Connected to Redis successfully")
	}

	return &RedisService{
		client: client,
		active: active,
	}
}

// IsActive returns the status of the Redis connection.
func (s *RedisService) IsActive() bool {
	return s.active
}

// Get fetches data from Redis and unmarshals it.
func (s *RedisService) Get(ctx context.Context, key string, dest interface{}) error {
	if s == nil || !s.active {
		return fmt.Errorf("redis is inactive")
	}
	val, err := s.client.Get(ctx, key).Result()
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(val), dest)
}

// Set stores data in Redis after marshaling it.
func (s *RedisService) Set(ctx context.Context, key string, val interface{}, ttl time.Duration) error {
	if s == nil || !s.active {
		return fmt.Errorf("redis is inactive")
	}
	bytes, err := json.Marshal(val)
	if err != nil {
		return err
	}
	return s.client.Set(ctx, key, bytes, ttl).Err()
}

// Delete removes a key from Redis.
func (s *RedisService) Delete(ctx context.Context, key string) error {
	if s == nil || !s.active {
		return fmt.Errorf("redis is inactive")
	}
	return s.client.Del(ctx, key).Err()
}

// PushQueue appends a value to a list (Queue).
func (s *RedisService) PushQueue(ctx context.Context, listKey string, item interface{}) error {
	if s == nil || !s.active {
		return fmt.Errorf("redis is inactive")
	}
	bytes, err := json.Marshal(item)
	if err != nil {
		return err
	}
	return s.client.RPush(ctx, listKey, bytes).Err()
}

// PopQueue pops a value from the head of a list.
func (s *RedisService) PopQueue(ctx context.Context, listKey string) (string, error) {
	if s == nil || !s.active {
		return "", fmt.Errorf("redis is inactive")
	}
	return s.client.LPop(ctx, listKey).Result()
}

// PopQueueBatch pops up to limit values from a Redis list.
func (s *RedisService) PopQueueBatch(ctx context.Context, listKey string, limit int) ([]string, error) {
	if s == nil || !s.active {
		return nil, fmt.Errorf("redis is inactive")
	}
	if limit <= 0 {
		return nil, nil
	}

	items := make([]string, 0, limit)
	for len(items) < limit {
		item, err := s.client.LPop(ctx, listKey).Result()
		if err == redis.Nil {
			return items, nil
		}
		if err != nil {
			return items, err
		}
		items = append(items, item)
	}
	return items, nil
}

// SetString stores a raw string value.
func (s *RedisService) SetString(ctx context.Context, key string, val string, ttl time.Duration) error {
	if s == nil || !s.active {
		return fmt.Errorf("redis is inactive")
	}
	return s.client.Set(ctx, key, val, ttl).Err()
}
