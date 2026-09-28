package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"backend/internal/config"
)

type StockPhoto struct {
	ID              int64  `json:"id"`
	Alt             string `json:"alt"`
	Width           int    `json:"width"`
	Height          int    `json:"height"`
	AvgColor        string `json:"avg_color"`
	PageURL         string `json:"page_url"`
	Photographer    string `json:"photographer"`
	PhotographerURL string `json:"photographer_url"`
	Thumb           string `json:"thumb"`
	Preview         string `json:"preview"`
	Full            string `json:"full"`
}

type StockSearchResponse struct {
	Query   string       `json:"query"`
	Page    int          `json:"page"`
	HasMore bool         `json:"has_more"`
	Photos  []StockPhoto `json:"photos"`
}

var ErrStockUnavailable = errors.New("Stock photos are unavailable right now.")

const (
	stockPerPage  = 12
	stockCacheTTL = time.Hour
	stockCacheMax = 500
)

type stockCacheEntry struct {
	res     *StockSearchResponse
	expires time.Time
}

type StockImageService struct {
	cfg        *config.Config
	httpClient *http.Client
	mu         sync.Mutex
	cache      map[string]stockCacheEntry
}

func NewStockImageService(cfg *config.Config) *StockImageService {
	return &StockImageService{cfg: cfg, httpClient: &http.Client{Timeout: 15 * time.Second}, cache: map[string]stockCacheEntry{}}
}

func (s *StockImageService) Enabled() bool { return s.cfg.PexelsAPIKey != "" }

func (s *StockImageService) Search(query, aspect string, page int) (*StockSearchResponse, error) {
	if !s.Enabled() {
		return nil, ErrStockUnavailable
	}
	query = strings.Join(strings.Fields(query), " ")
	if len(query) < 2 {
		return nil, errors.New("describe the photo you want")
	}
	query = clipRunes(query, 100)
	if page < 1 {
		page = 1
	}
	aspect = normalizeImageAspect(aspect)
	key := fmt.Sprintf("%s|%s|%d", strings.ToLower(query), aspect, page)

	s.mu.Lock()
	if e, ok := s.cache[key]; ok && time.Now().Before(e.expires) {
		s.mu.Unlock()
		return e.res, nil
	}
	s.mu.Unlock()

	params := url.Values{"query": {query}, "per_page": {fmt.Sprint(stockPerPage)}, "page": {fmt.Sprint(page)}, "orientation": {aspect}}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.pexels.com/v1/search?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", s.cfg.PexelsAPIKey)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		log.Printf("Pexels: search failed: %v", err)
		return nil, ErrStockUnavailable
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode != http.StatusOK {
		log.Printf("Pexels: search returned status %d: %.200s", resp.StatusCode, body)
		return nil, ErrStockUnavailable
	}

	var raw struct {
		Photos []struct {
			ID              int64  `json:"id"`
			Width           int    `json:"width"`
			Height          int    `json:"height"`
			URL             string `json:"url"`
			Photographer    string `json:"photographer"`
			PhotographerURL string `json:"photographer_url"`
			AvgColor        string `json:"avg_color"`
			Alt             string `json:"alt"`
			Src             struct {
				Original  string `json:"original"`
				Large2x   string `json:"large2x"`
				Large     string `json:"large"`
				Medium    string `json:"medium"`
				Portrait  string `json:"portrait"`
				Landscape string `json:"landscape"`
			} `json:"src"`
		} `json:"photos"`
		NextPage string `json:"next_page"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, ErrStockUnavailable
	}

	out := &StockSearchResponse{Query: query, Page: page, HasMore: raw.NextPage != "", Photos: make([]StockPhoto, 0, len(raw.Photos))}
	for _, p := range raw.Photos {
		preview := p.Src.Large
		switch aspect {
		case "portrait":
			preview = p.Src.Portrait
		case "landscape":
			preview = p.Src.Landscape
		}
		out.Photos = append(out.Photos, StockPhoto{
			ID: p.ID, Alt: p.Alt, Width: p.Width, Height: p.Height, AvgColor: p.AvgColor,
			PageURL: p.URL, Photographer: p.Photographer, PhotographerURL: p.PhotographerURL,
			Thumb: p.Src.Medium, Preview: preview, Full: p.Src.Large2x,
		})
	}

	s.mu.Lock()
	if len(s.cache) >= stockCacheMax {
		s.cache = map[string]stockCacheEntry{}
	}
	s.cache[key] = stockCacheEntry{res: out, expires: time.Now().Add(stockCacheTTL)}
	s.mu.Unlock()
	return out, nil
}
