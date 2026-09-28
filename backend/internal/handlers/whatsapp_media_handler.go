package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"backend/pkg/response"
	"backend/pkg/storage"

	"github.com/gofiber/fiber/v2"
)

const whatsAppMediaMaxBytes = 5 << 20

var whatsAppMediaTypes = map[string]string{"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

type WhatsAppMediaHandler struct {
	storage storage.StorageProvider
}

func NewWhatsAppMediaHandler(storage storage.StorageProvider) *WhatsAppMediaHandler {
	return &WhatsAppMediaHandler{storage: storage}
}

// UploadImage godoc
// @Summary      Upload a WhatsApp image
// @Description  Upload a JPEG, PNG or WebP image (max 5 MB) to use as a WhatsApp banner or photo. Returns its URL.
// @Tags         WhatsApp
// @Security     BearerAuth
// @Accept       multipart/form-data
// @Produce      json
// @Param        file  formData  file  true  "Image file"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  response.ErrorResponse
// @Router       /whatsapp/media [post]
func (h *WhatsAppMediaHandler) UploadImage(c *fiber.Ctx) error {
	header, err := c.FormFile("file")
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "Choose an image to upload")
	}
	if header.Size > whatsAppMediaMaxBytes {
		return response.Error(c, fiber.StatusBadRequest, "The image must be 5 MB or smaller")
	}
	file, err := header.Open()
	if err != nil {
		return response.Error(c, fiber.StatusBadRequest, "The image could not be read")
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, whatsAppMediaMaxBytes+1))
	if err != nil || len(data) > whatsAppMediaMaxBytes {
		return response.Error(c, fiber.StatusBadRequest, "The image must be 5 MB or smaller")
	}
	contentType := http.DetectContentType(data)
	ext, ok := whatsAppMediaTypes[contentType]
	if !ok {
		return response.Error(c, fiber.StatusBadRequest, "Use a JPEG, PNG or WebP image")
	}

	suffix := make([]byte, 6)
	_, _ = rand.Read(suffix)
	key := fmt.Sprintf("whatsapp-media/%d/%s-%s.%s", getUserID(c), time.Now().Format("20060102-150405"), hex.EncodeToString(suffix), ext)
	url, err := h.storage.Upload(key, data, contentType)
	if err != nil {
		log.Printf("WhatsApp media: upload %s failed: %v", key, err)
		return response.Error(c, fiber.StatusServiceUnavailable, "The image couldn't be saved right now. Please try again.")
	}
	return response.Success(c, fiber.Map{"url": url})
}
