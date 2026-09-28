package services

import (
	"encoding/json"
	"errors"
	"strings"

	"backend/internal/models"

	"gorm.io/gorm"
)

const (
	aiConversationMaxBytes = 2 << 20 // 2 MB of chat JSON per conversation
	aiConversationMaxTitle = 60
	aiConversationListMax  = 200
)

// ErrAIConversationNotFound is returned for missing or foreign conversations.
var ErrAIConversationNotFound = errors.New("conversation not found")

// AIConversationService stores each user's assistant chats and names them automatically.
type AIConversationService struct {
	db *gorm.DB
	ai *AITemplateService
}

// NewAIConversationService creates an AIConversationService.
func NewAIConversationService(db *gorm.DB, ai *AITemplateService) *AIConversationService {
	return &AIConversationService{db: db, ai: ai}
}

func toConversationResponse(c *models.AIConversation) *models.AIConversationResponse {
	return &models.AIConversationResponse{ID: c.ID, Title: c.Title, Messages: json.RawMessage(c.Messages), CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt}
}

// validateMessages checks the chat is a JSON array of a sane size.
func validateMessages(raw json.RawMessage) (string, error) {
	if len(raw) == 0 {
		return "[]", nil
	}
	if len(raw) > aiConversationMaxBytes {
		return "", errors.New("this conversation is too long to save; start a new chat")
	}
	var turns []json.RawMessage
	if err := json.Unmarshal(raw, &turns); err != nil {
		return "", errors.New("messages must be a JSON array")
	}
	return string(raw), nil
}

func cleanTitle(title string) string {
	title = strings.Join(strings.Fields(title), " ")
	title = strings.Trim(title, " \"'`*#.:")
	return strings.TrimSpace(clipTitle(title))
}

func clipTitle(title string) string {
	if r := []rune(title); len(r) > aiConversationMaxTitle {
		return strings.TrimSpace(string(r[:aiConversationMaxTitle-1])) + "…"
	}
	return title
}

// List returns the user's conversations, most recently used first.
func (s *AIConversationService) List(userID uint, search string) ([]models.AIConversationSummary, error) {
	q := s.db.Model(&models.AIConversation{}).Where("user_id = ?", userID)
	if search = strings.TrimSpace(search); search != "" {
		q = q.Where("title ILIKE ?", "%"+search+"%")
	}
	out := []models.AIConversationSummary{}
	err := q.Select("id, title, created_at, updated_at").Order("updated_at DESC").Limit(aiConversationListMax).Scan(&out).Error
	return out, err
}

func (s *AIConversationService) owned(userID, id uint) (*models.AIConversation, error) {
	var c models.AIConversation
	if err := s.db.Where("id = ? AND user_id = ?", id, userID).First(&c).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrAIConversationNotFound
		}
		return nil, err
	}
	return &c, nil
}

// Get returns one conversation with its messages.
func (s *AIConversationService) Get(userID, id uint) (*models.AIConversationResponse, error) {
	c, err := s.owned(userID, id)
	if err != nil {
		return nil, err
	}
	return toConversationResponse(c), nil
}

// Create saves a new conversation.
func (s *AIConversationService) Create(userID uint, req *models.SaveAIConversationRequest) (*models.AIConversationResponse, error) {
	messages, err := validateMessages(req.Messages)
	if err != nil {
		return nil, err
	}
	c := &models.AIConversation{UserID: userID, Title: cleanTitle(req.Title), Messages: messages}
	if c.Title == "" {
		c.Title = s.generateTitle(messages)
	}
	if err := s.db.Create(c).Error; err != nil {
		return nil, err
	}
	return toConversationResponse(c), nil
}

// Update replaces a conversation's messages and/or renames it.
func (s *AIConversationService) Update(userID, id uint, req *models.SaveAIConversationRequest) (*models.AIConversationResponse, error) {
	c, err := s.owned(userID, id)
	if err != nil {
		return nil, err
	}
	if len(req.Messages) > 0 {
		if c.Messages, err = validateMessages(req.Messages); err != nil {
			return nil, err
		}
	}
	if title := cleanTitle(req.Title); title != "" {
		c.Title = title
	} else if c.Title == "" {
		c.Title = s.generateTitle(c.Messages)
	}
	if err := s.db.Save(c).Error; err != nil {
		return nil, err
	}
	return toConversationResponse(c), nil
}

// Delete removes a conversation.
func (s *AIConversationService) Delete(userID, id uint) error {
	res := s.db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.AIConversation{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrAIConversationNotFound
	}
	return nil
}

// generateTitle names a chat from its first exchange. It returns "" until the assistant has answered,
// so the next save tries again, and falls back to the user's first words if the model is unavailable.
func (s *AIConversationService) generateTitle(messages string) string {
	var turns []struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	if json.Unmarshal([]byte(messages), &turns) != nil {
		return ""
	}
	var question, answer string
	for _, t := range turns {
		if t.Role == "user" && question == "" {
			question = strings.TrimSpace(t.Content)
		}
		if t.Role == "assistant" && answer == "" && question != "" {
			answer = strings.TrimSpace(t.Content)
		}
	}
	if question == "" || answer == "" {
		return ""
	}

	fallback := cleanTitle(strings.Join(firstWords(question, 6), " "))
	if s.ai == nil || s.ai.cfg.NVIDIAAPIKey == "" {
		return fallback
	}
	body, err := s.ai.completeWithFallback([]map[string]string{
		{"role": "system", "content": "You name chat conversations. Reply with ONLY a short title of 2 to 6 words in Title Case that says what the user wants, e.g. \"Weekend Juice Sale Flyer\" or \"Payment Reminder SMS Campaign\". No quotes, no emojis, no trailing punctuation."},
		{"role": "user", "content": "User: " + clipRunes(question, 600) + "\nAssistant: " + clipRunes(answer, 400)},
	}, aiCallOptions{MaxTokens: 40})
	if err != nil {
		return fallback
	}
	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(body, &completion) != nil || len(completion.Choices) == 0 {
		return fallback
	}
	title := completion.Choices[0].Message.Content
	if i := strings.Index(title, "</think>"); i >= 0 {
		title = title[i+len("</think>"):]
	}
	if i := strings.IndexByte(strings.TrimSpace(title), '\n'); i > 0 {
		title = strings.TrimSpace(title)[:i]
	}
	if title = cleanTitle(title); title == "" || len(strings.Fields(title)) > 10 {
		return fallback
	}
	return title
}

func firstWords(s string, n int) []string {
	words := strings.Fields(s)
	if len(words) > n {
		words = words[:n]
	}
	return words
}
