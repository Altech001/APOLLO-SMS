package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"backend/internal/config"
)

// AITemplateRequest describes the template a user wants written or rewritten.
type AITemplateRequest struct {
	Prompt   string `json:"prompt"`   // what to write, or an extra instruction for a rewrite
	Content  string `json:"content"`  // current template body, used as a draft or rewritten by Mode
	Mode     string `json:"mode"`     // create (default), polish, elaborate, formalise, shorten
	Channel  string `json:"channel"`  // sms or whatsapp
	Category string `json:"category"` // optional hint
	Tone     string `json:"tone"`     // optional, e.g. friendly, formal
}

// aiRewriteInstructions describes each rewrite mode offered by "Help me write".
var aiRewriteInstructions = map[string]string{
	"polish":    "Polish this template: fix grammar and spelling, improve clarity and flow, keep the meaning and length about the same.",
	"elaborate": "Elaborate on this template: add helpful detail and a clear call to action while respecting the channel's length rules.",
	"formalise": "Rewrite this template in a formal, professional tone.",
	"shorten":   "Make this template shorter and punchier without losing key information.",
}

// AITemplateResponse is a generated template ready to save.
type AITemplateResponse struct {
	Name     string `json:"name"`
	Category string `json:"category"`
	Channel  string `json:"channel"`
	Content  string `json:"content"`
}

var aiTemplateCategories = []string{"Authentication", "Marketing", "Transactional", "Alert"}

// AITemplateService drafts SMS and WhatsApp templates with an NVIDIA NIM chat model.
type AITemplateService struct {
	cfg        *config.Config
	httpClient *http.Client
	health     *modelHealth
}

// NewAITemplateService creates an AITemplateService.
func NewAITemplateService(cfg *config.Config) *AITemplateService {
	return &AITemplateService{cfg: cfg, httpClient: &http.Client{}, health: newModelHealth()}
}

func aiTemplateSystemPrompt(channel string) string {
	rules := `Rules for SMS:
- At most 160 characters when possible, never more than 306.
- Plain text only: no emojis, no markdown, no line breaks unless essential.`
	if channel == "whatsapp" {
		rules = `Rules for WhatsApp:
- Up to about 700 characters; short paragraphs separated by line breaks.
- WhatsApp formatting is allowed: *bold*, _italic_. Use at most two emojis.
- End with a clear call to action.
- Include an opt-out line such as "Reply STOP to opt out." for marketing messages.`
	}
	return `You write reusable business message templates for a messaging platform in Uganda.
Use placeholders in curly braces for personal details, e.g. {name}, {code}, {amount}, {date}, {link}. Never invent real names, numbers or links.
` + rules + `
Respond with ONLY a JSON object, no prose and no code fences:
{"name": "<short template name, max 40 chars>", "category": "<one of Authentication, Marketing, Transactional, Alert>", "content": "<template text>"}`
}

// Generate asks the model for a template and validates its JSON answer.
func (s *AITemplateService) Generate(req *AITemplateRequest) (*AITemplateResponse, error) {
	if s.cfg.NVIDIAAPIKey == "" {
		log.Printf("AI: template generation requested but NVIDIA_API_KEY is missing")
		return nil, ErrAIUnavailable
	}
	prompt := strings.TrimSpace(req.Prompt)
	content := strings.TrimSpace(req.Content)
	mode := strings.ToLower(strings.TrimSpace(req.Mode))
	if mode == "" {
		mode = "create"
	}
	if len(prompt) > 1000 || len(content) > 4096 {
		return nil, errors.New("text is too long for the AI helper")
	}
	channel := normalizeTemplateChannel(req.Channel)

	var user string
	if instruction, ok := aiRewriteInstructions[mode]; ok {
		if content == "" {
			return nil, errors.New("write or generate some text first, then use " + mode)
		}
		user = instruction + " Keep every {placeholder} exactly as written.\nTemplate:\n" + content
		if prompt != "" {
			user += "\nExtra instruction: " + prompt
		}
	} else {
		if len(prompt) < 3 {
			return nil, errors.New("describe the message you want in a few words")
		}
		user = "Write a " + channel + " template for: " + prompt
		if content != "" {
			user += "\nUse this draft as a starting point:\n" + content
		}
	}
	if req.Category != "" {
		user += "\nPreferred category: " + req.Category
	}
	if req.Tone != "" {
		user += "\nTone: " + req.Tone
	}

	messages := []map[string]string{
		{"role": "system", "content": aiTemplateSystemPrompt(channel)},
		{"role": "user", "content": user},
	}
	respBody, err := s.completeWithFallback(messages, aiCallOptions{MaxTokens: 700, Validate: func(body []byte) error {
		content, err := completionContent(body)
		if err == nil {
			_, err = parseAITemplate(content, channel, req.Category)
		}
		return err
	}})
	if err != nil {
		return nil, err
	}

	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &completion); err != nil || len(completion.Choices) == 0 {
		return nil, errors.New("AI service returned an unexpected response")
	}

	return parseAITemplate(completion.Choices[0].Message.Content, channel, req.Category)
}

// parseAITemplate extracts the JSON object from the model output, tolerating code fences or extra text.
func parseAITemplate(raw, channel, fallbackCategory string) (*AITemplateResponse, error) {
	start, end := strings.Index(raw, "{"), strings.LastIndex(raw, "}")
	if start < 0 || end <= start {
		return nil, errors.New("AI did not return a template; try rephrasing")
	}
	var out AITemplateResponse
	if err := json.Unmarshal([]byte(raw[start:end+1]), &out); err != nil {
		return nil, errors.New("AI returned an invalid template; try again")
	}

	out.Content = strings.TrimSpace(out.Content)
	if out.Content == "" {
		return nil, errors.New("AI returned an empty template; try again")
	}
	out.Name = strings.TrimSpace(out.Name)
	if out.Name == "" {
		out.Name = "AI template"
	}
	if len(out.Name) > 60 {
		out.Name = out.Name[:60]
	}
	out.Channel = channel

	category := ""
	for _, c := range aiTemplateCategories {
		if strings.EqualFold(c, strings.TrimSpace(out.Category)) {
			category = c
		}
	}
	if category == "" {
		category = fallbackCategory
	}
	if category == "" {
		category = "Transactional"
	}
	out.Category = category
	return &out, nil
}

// aiServiceError turns an NVIDIA error response into a message that says what to fix.
func aiServiceError(status int, body []byte, model string) error {
	var apiErr struct {
		Detail string `json:"detail"`
		Error  any    `json:"error"`
	}
	_ = json.Unmarshal(body, &apiErr)
	detail := apiErr.Detail
	if detail == "" && apiErr.Error != nil {
		detail = fmt.Sprint(apiErr.Error)
	}
	switch status {
	case http.StatusGone, http.StatusNotFound:
		return fmt.Errorf("AI model %q is no longer available on NVIDIA (status %d); set NVIDIA_MODEL to a current model", model, status)
	case http.StatusUnauthorized, http.StatusForbidden:
		return fmt.Errorf("NVIDIA rejected the API key (status %d); check NVIDIA_API_KEY", status)
	case http.StatusTooManyRequests:
		return errors.New("AI service is busy (rate limited); try again in a minute")
	}
	if detail != "" {
		return fmt.Errorf("AI service error (status %d): %s", status, detail)
	}
	return fmt.Errorf("AI service returned status %d", status)
}

// Each model attempt is capped so one stalled model doesn't block the others, and the whole
// request has a budget so the user isn't left waiting through every model's full timeout.
// Reasoning ("thinking") answers take much longer, so they get larger limits.
const (
	aiAttemptTimeout         = 45 * time.Second
	aiThinkingAttemptTimeout = 100 * time.Second
	aiRequestBudget          = 110 * time.Second
	aiThinkingRequestBudget  = 200 * time.Second
	aiMinAttemptTime         = 8 * time.Second
)

// aiCallOptions tunes one completion request.
type aiCallOptions struct {
	MaxTokens int
	// Thinking lets reasoning models think before answering; their reasoning is returned separately.
	Thinking bool
	// Preferred is tried first when it's one of the configured models; the others follow as fallbacks.
	Preferred string
	// Validate rejects an unusable answer (e.g. empty or not the requested JSON); the next model is tried.
	Validate func(body []byte) error
}

// aiModels returns the configured models in fallback order (NVIDIA_MODEL is comma-separated).
func (s *AITemplateService) aiModels() []string {
	return splitModels(s.cfg.NVIDIAModel)
}

// Models lists the configured chat models with their current health, for the model picker.
func (s *AITemplateService) Models() []AIModelInfo {
	models := s.aiModels()
	out := make([]AIModelInfo, 0, len(models))
	for _, id := range models {
		info := modelInfo(id)
		info.Status = s.health.status(id)
		out = append(out, info)
	}
	return out
}

// completeWithFallback asks the healthiest model first and switches automatically when one is
// overloaded, times out, is rate limited or has been retired, remembering failures so later
// requests skip bad models. Users only ever see ErrAIBusy / ErrAIUnavailable; causes are logged.
func (s *AITemplateService) completeWithFallback(messages []map[string]string, opts aiCallOptions) ([]byte, error) {
	models := s.aiModels()
	if len(models) == 0 || s.cfg.NVIDIAAPIKey == "" {
		log.Printf("AI: not configured (NVIDIA_API_KEY or NVIDIA_MODEL is empty)")
		return nil, ErrAIUnavailable
	}
	attemptTimeout, budget := aiAttemptTimeout, aiRequestBudget
	if opts.Thinking {
		attemptTimeout, budget = aiThinkingAttemptTimeout, aiThinkingRequestBudget
	}
	deadline := time.Now().Add(budget)

	// Two passes: if every model was busy, wait briefly and give the soonest-recovering ones another go.
	tried := 0
	for pass := 0; pass < 2; pass++ {
		if pass == 1 {
			time.Sleep(1500 * time.Millisecond)
		}
		for _, model := range s.health.order(models, opts.Preferred) {
			remaining := time.Until(deadline)
			if remaining < aiMinAttemptTime {
				log.Printf("AI: request budget used up after %d attempts", tried)
				return nil, ErrAIBusy
			}
			tried++
			payload := map[string]interface{}{
				"model":       model,
				"messages":    messages,
				"temperature": 0.4,
				"top_p":       0.7,
				"max_tokens":  opts.MaxTokens,
				"stream":      false,
			}
			// Nemotron 3 models reason before answering unless thinking is disabled.
			if strings.Contains(model, "nemotron-3") {
				payload["chat_template_kwargs"] = map[string]bool{"enable_thinking": opts.Thinking}
			}
			body, _ := json.Marshal(payload)

			status, respBody, err := s.post(body, min(attemptTimeout, remaining))
			switch {
			case err != nil:
				s.health.busy(model)
				log.Printf("AI: model %s failed (%v), switching model", model, err)
			case status < 300:
				if opts.Validate != nil {
					if verr := opts.Validate(respBody); verr != nil {
						s.health.busy(model)
						log.Printf("AI: model %s gave an unusable answer (%v), switching model", model, verr)
						continue
					}
				}
				s.health.succeeded(model)
				return respBody, nil
			case status == http.StatusUnauthorized || status == http.StatusForbidden:
				log.Printf("AI: %v", aiServiceError(status, respBody, model))
				return nil, ErrAIUnavailable
			case status == http.StatusNotFound || status == http.StatusGone:
				s.health.retire(model)
				log.Printf("AI: model %s is retired or not enabled for this key (status %d); skipping it for %s", model, status, modelRetiredFor)
			default: // 429, 5xx and anything unexpected: cool the model down and try the next one
				s.health.busy(model)
				log.Printf("AI: model %s failed (%v), switching model", model, aiServiceError(status, respBody, model))
			}
		}
	}
	return nil, ErrAIBusy
}

func (s *AITemplateService) post(body []byte, timeout time.Duration) (int, []byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.NVIDIABaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return 0, nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+s.cfg.NVIDIAAPIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return 0, nil, errors.New("AI service took too long to answer; please try again")
		}
		return 0, nil, fmt.Errorf("AI service is unreachable: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return resp.StatusCode, respBody, nil
}
