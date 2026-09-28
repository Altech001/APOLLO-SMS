package services

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"backend/internal/config"
	"backend/pkg/storage"
)

// AIImageRequest describes an image the assistant should draw.
type AIImageRequest struct {
	Prompt string `json:"prompt"`
	Aspect string `json:"aspect"` // square (default), landscape or portrait
	Seed   int64  `json:"seed"`   // 0 picks a random seed
}

// AIImageResponse is a generated image saved to storage.
type AIImageResponse struct {
	URL    string `json:"url"`
	Prompt string `json:"prompt"`
	Aspect string `json:"aspect"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Seed   int64  `json:"seed"`
}

// aiImageSizes are sizes FLUX.1 accepts, per aspect.
var aiImageSizes = map[string][2]int{
	"square":    {1024, 1024},
	"landscape": {1344, 768},
	"portrait":  {768, 1344},
}

// Each image model gets up to aiImageTimeout; the whole request stops switching after aiImageBudget.
const (
	aiImageTimeout = 45 * time.Second
	aiImageBudget  = 100 * time.Second
)

// AIImageService draws images with an NVIDIA NIM image model and stores them so the chat can link to them.
type AIImageService struct {
	cfg        *config.Config
	storage    storage.StorageProvider
	httpClient *http.Client
	health     *modelHealth
}

// NewAIImageService creates an AIImageService.
func NewAIImageService(cfg *config.Config, storageProvider storage.StorageProvider) *AIImageService {
	return &AIImageService{cfg: cfg, storage: storageProvider, httpClient: &http.Client{}, health: newModelHealth()}
}

func normalizeImageAspect(aspect string) string {
	aspect = strings.ToLower(strings.TrimSpace(aspect))
	switch aspect {
	case "landscape", "wide", "horizontal", "16:9", "banner":
		return "landscape"
	case "portrait", "vertical", "tall", "9:16", "story", "poster", "flyer":
		return "portrait"
	}
	return "square"
}

// aiImagePayload builds the request body for an image model family.
func aiImagePayload(model, prompt string, width, height int, seed int64) map[string]interface{} {
	switch {
	case strings.Contains(model, "stable-diffusion-3"):
		ratio := "1:1"
		if width > height {
			ratio = "16:9"
		} else if height > width {
			ratio = "9:16"
		}
		return map[string]interface{}{"prompt": prompt, "cfg_scale": 5, "aspect_ratio": ratio, "seed": seed, "steps": 40, "negative_prompt": ""}
	case strings.Contains(model, "flux.1-dev"):
		return map[string]interface{}{"prompt": prompt, "mode": "base", "cfg_scale": 3.5, "width": width, "height": height, "seed": seed, "steps": 30}
	case strings.Contains(model, "schnell"):
		return map[string]interface{}{"prompt": prompt, "width": width, "height": height, "seed": seed, "steps": 4}
	default: // FLUX.2 and others use their own defaults for steps
		return map[string]interface{}{"prompt": prompt, "width": width, "height": height, "seed": seed}
	}
}

var errImageFiltered = errors.New("the image was blocked by the safety filter; try a different description")

// Generate draws the image with the first healthy image model (switching automatically when one is
// busy or retired), uploads it and returns its URL.
func (s *AIImageService) Generate(userID uint, req *AIImageRequest) (*AIImageResponse, error) {
	models := splitModels(s.cfg.NVIDIAImageModel)
	if s.cfg.NVIDIAAPIKey == "" || len(models) == 0 {
		log.Printf("AI images: not configured (NVIDIA_API_KEY or NVIDIA_IMAGE_MODEL is empty)")
		return nil, errors.New("Image generation is temporarily unavailable.")
	}
	prompt := strings.TrimSpace(req.Prompt)
	if len(prompt) < 3 {
		return nil, errors.New("describe the image you want")
	}
	if len(prompt) > 2000 {
		return nil, errors.New("the image description is too long; keep it under 2000 characters")
	}
	aspect := normalizeImageAspect(req.Aspect)
	size := aiImageSizes[aspect]

	deadline := time.Now().Add(aiImageBudget)
	var image []byte
	var seed int64
	for _, model := range s.health.order(models, "") {
		remaining := time.Until(deadline)
		if remaining < 10*time.Second {
			break
		}
		img, sd, err := s.draw(model, aiImagePayload(model, prompt, size[0], size[1], req.Seed), min(aiImageTimeout, remaining))
		if err == nil {
			s.health.succeeded(model)
			image, seed = img, sd
			break
		}
		if errors.Is(err, errImageFiltered) {
			return nil, err
		}
		var gone *imageModelGone
		if errors.As(err, &gone) {
			s.health.retire(model)
		} else {
			s.health.busy(model)
		}
		log.Printf("AI images: model %s failed (%v), switching model", model, err)
	}
	if image == nil {
		return nil, errors.New("The image service is very busy right now. Please try again in a moment.")
	}

	contentType, ext := "image/jpeg", "jpg"
	if bytes.HasPrefix(image, []byte("\x89PNG")) {
		contentType, ext = "image/png", "png"
	}
	suffix := make([]byte, 6)
	_, _ = rand.Read(suffix)
	key := fmt.Sprintf("ai-images/%d/%s-%s.%s", userID, time.Now().Format("20060102-150405"), hex.EncodeToString(suffix), ext)
	url, err := s.storage.Upload(key, image, contentType)
	if err != nil {
		log.Printf("AI images: saving %s failed: %v", key, err)
		return nil, errors.New("The image was drawn but couldn't be saved. Please try again.")
	}
	return &AIImageResponse{URL: url, Prompt: prompt, Aspect: aspect, Width: size[0], Height: size[1], Seed: seed}, nil
}

type imageModelGone struct{ status int }

func (e *imageModelGone) Error() string {
	return fmt.Sprintf("model retired or not enabled (status %d)", e.status)
}

// draw calls one image model and returns the decoded image.
func (s *AIImageService) draw(model string, payload map[string]interface{}, timeout time.Duration) ([]byte, int64, error) {
	body, _ := json.Marshal(payload)
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.NVIDIAImageBaseURL+"/"+model, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+s.cfg.NVIDIAAPIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 20<<20))
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
		return nil, 0, &imageModelGone{status: resp.StatusCode}
	}
	if resp.StatusCode >= 300 {
		return nil, 0, aiServiceError(resp.StatusCode, respBody, model)
	}

	// FLUX returns {"artifacts": [{"base64", "finishReason", "seed"}]}; Stable Diffusion 3 returns {"image"}.
	var out struct {
		Artifacts []struct {
			Base64       string `json:"base64"`
			FinishReason string `json:"finishReason"`
			Seed         int64  `json:"seed"`
		} `json:"artifacts"`
		Image string `json:"image"`
		Seed  int64  `json:"seed"`
	}
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, 0, errors.New("unexpected response")
	}
	encoded, seed := out.Image, out.Seed
	if len(out.Artifacts) > 0 {
		a := out.Artifacts[0]
		if strings.EqualFold(a.FinishReason, "CONTENT_FILTERED") {
			return nil, 0, errImageFiltered
		}
		encoded, seed = a.Base64, a.Seed
	}
	image, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(image) == 0 {
		return nil, 0, errors.New("no image in response")
	}
	return image, seed, nil
}
