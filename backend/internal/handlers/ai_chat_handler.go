package handlers

import (
	"errors"

	"backend/internal/models"
	"backend/internal/services"
	"backend/pkg/response"

	"github.com/gofiber/fiber/v2"
)

// AIChatHandler serves the in-app AI assistant and the personalised sends it prepares.
type AIChatHandler struct {
	chat          *services.AIChatService
	batch         *services.BatchSendService
	images        *services.AIImageService
	conversations *services.AIConversationService
	stock         *services.StockImageService
}

// NewAIChatHandler creates a new AIChatHandler.
func NewAIChatHandler(chat *services.AIChatService, batch *services.BatchSendService, images *services.AIImageService, conversations *services.AIConversationService, stock *services.StockImageService) *AIChatHandler {
	return &AIChatHandler{chat: chat, batch: batch, images: images, conversations: conversations, stock: stock}
}

// Chat godoc
// @Summary      Chat with the AI assistant
// @Description  Continue a conversation with the messaging assistant. It sees the user's balances, contacts, groups and recent messages, answers in markdown, and may propose actions (send_sms, send_whatsapp, send_personalized, send_from_file, create_template) that the app asks the user to confirm. Nothing is sent or saved by this endpoint.
// @Tags         AI
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  services.AIChatRequest  true  "Conversation so far, ending with the user's message"
// @Success      200  {object}  services.AIChatResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /ai/chat [post]
func (h *AIChatHandler) Chat(c *fiber.Ctx) error {
	var req services.AIChatRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	res, err := h.chat.Chat(getUserID(c), &req)
	if errors.Is(err, services.ErrAIBusy) || errors.Is(err, services.ErrAIUnavailable) {
		return response.Error(c, fiber.StatusServiceUnavailable, err.Error())
	}
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, res)
}

// SendBatch godoc
// @Summary      Send personalised messages
// @Description  Send a different SMS or WhatsApp message to each recipient (up to 1000). The whole batch is checked against the balance first; each message is billed like a normal send.
// @Tags         AI
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  services.BatchSendRequest  true  "Channel, WhatsApp number and messages"
// @Success      200  {object}  services.BatchSendResponse
// @Failure      400  {object}  response.ErrorResponse
// @Failure      402  {object}  response.ErrorResponse
// @Router       /messages/batch [post]
func (h *AIChatHandler) SendBatch(c *fiber.Ctx) error {
	var req services.BatchSendRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	res, err := h.batch.Send(getUserID(c), &req)
	if errors.Is(err, services.ErrBatchPaymentRequired) || errors.Is(err, services.ErrWhatsAppPaymentRequired) {
		return response.Error(c, fiber.StatusPaymentRequired, err.Error())
	}
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, res)
}

// GenerateImage godoc
// @Summary      Generate an image with AI
// @Description  Draw an image from a text description with an NVIDIA NIM image model (FLUX.1-schnell by default). The image is saved to storage and its URL returned.
// @Tags         AI
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  services.AIImageRequest  true  "Image description and aspect (square, landscape, portrait)"
// @Success      200  {object}  services.AIImageResponse
// @Failure      400  {object}  response.ErrorResponse
// @Router       /ai/images/generate [post]
func (h *AIChatHandler) GenerateImage(c *fiber.Ctx) error {
	var req services.AIImageRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	res, err := h.images.Generate(getUserID(c), &req)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, res)
}

func (h *AIChatHandler) conversationError(c *fiber.Ctx, err error) error {
	if errors.Is(err, services.ErrAIConversationNotFound) {
		return response.Error(c, fiber.StatusNotFound, err.Error())
	}
	return response.Error(c, fiber.StatusBadRequest, err.Error())
}

func conversationID(c *fiber.Ctx) (uint, error) {
	id, err := c.ParamsInt("id")
	if err != nil || id <= 0 {
		return 0, errors.New("invalid conversation id")
	}
	return uint(id), nil
}

// ListConversations godoc
// @Summary      List AI conversations
// @Description  The user's assistant chats, most recently used first (up to 200). Optional title search.
// @Tags         AI
// @Security     BearerAuth
// @Produce      json
// @Param        search  query  string  false  "Filter by title"
// @Success      200  {array}  models.AIConversationSummary
// @Router       /ai/conversations [get]
func (h *AIChatHandler) ListConversations(c *fiber.Ctx) error {
	list, err := h.conversations.List(getUserID(c), c.Query("search"))
	if err != nil {
		return response.Error(c, fiber.StatusInternalServerError, "Unable to load conversations")
	}
	return response.Success(c, list)
}

// GetConversation godoc
// @Summary      Get an AI conversation
// @Tags         AI
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  models.AIConversationResponse
// @Failure      404  {object}  response.ErrorResponse
// @Router       /ai/conversations/{id} [get]
func (h *AIChatHandler) GetConversation(c *fiber.Ctx) error {
	id, err := conversationID(c)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	res, err := h.conversations.Get(getUserID(c), id)
	if err != nil {
		return h.conversationError(c, err)
	}
	return response.Success(c, res)
}

// CreateConversation godoc
// @Summary      Save a new AI conversation
// @Description  Saves the chat. Without a title, one is generated from the first exchange.
// @Tags         AI
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        body  body  models.SaveAIConversationRequest  true  "Messages and optional title"
// @Success      200  {object}  models.AIConversationResponse
// @Router       /ai/conversations [post]
func (h *AIChatHandler) CreateConversation(c *fiber.Ctx) error {
	var req models.SaveAIConversationRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	res, err := h.conversations.Create(getUserID(c), &req)
	if err != nil {
		return h.conversationError(c, err)
	}
	return response.Success(c, res)
}

// UpdateConversation godoc
// @Summary      Update or rename an AI conversation
// @Tags         AI
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Param        id    path  int                                true  "Conversation ID"
// @Param        body  body  models.SaveAIConversationRequest  true  "New messages and/or title"
// @Success      200  {object}  models.AIConversationResponse
// @Router       /ai/conversations/{id} [put]
func (h *AIChatHandler) UpdateConversation(c *fiber.Ctx) error {
	id, err := conversationID(c)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	var req models.SaveAIConversationRequest
	if err := c.BodyParser(&req); err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	res, err := h.conversations.Update(getUserID(c), id, &req)
	if err != nil {
		return h.conversationError(c, err)
	}
	return response.Success(c, res)
}

// DeleteConversation godoc
// @Summary      Delete an AI conversation
// @Tags         AI
// @Security     BearerAuth
// @Param        id  path  int  true  "Conversation ID"
// @Success      200  {object}  response.SuccessResponse
// @Router       /ai/conversations/{id} [delete]
func (h *AIChatHandler) DeleteConversation(c *fiber.Ctx) error {
	id, err := conversationID(c)
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	if err := h.conversations.Delete(getUserID(c), id); err != nil {
		return h.conversationError(c, err)
	}
	return response.Success(c, fiber.Map{"message": "Conversation deleted"})
}

// ListModels godoc
// @Summary      List AI models
// @Description  Chat models the user can pick, in fallback order, with live status (available, busy, unavailable). Picking one only sets the first choice; the others take over automatically when it is busy.
// @Tags         AI
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}  services.AIModelInfo
// @Router       /ai/models [get]
func (h *AIChatHandler) ListModels(c *fiber.Ctx) error {
	return response.Success(c, h.chat.Models())
}

// SearchStockImages godoc
// @Summary      Search stock photos
// @Description  Search Pexels photos for the assistant's image cards.
// @Tags         AI
// @Security     BearerAuth
// @Produce      json
// @Param        query   query  string  true   "What the photo should show"
// @Param        aspect  query  string  false  "square, landscape or portrait"
// @Param        page    query  int     false  "Result page"
// @Success      200  {object}  services.StockSearchResponse
// @Failure      503  {object}  response.ErrorResponse
// @Router       /ai/images/stock [get]
func (h *AIChatHandler) SearchStockImages(c *fiber.Ctx) error {
	res, err := h.stock.Search(c.Query("query"), c.Query("aspect"), c.QueryInt("page", 1))
	if errors.Is(err, services.ErrStockUnavailable) {
		return response.Error(c, fiber.StatusServiceUnavailable, err.Error())
	}
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, err.Error())
	}
	return response.Success(c, res)
}
