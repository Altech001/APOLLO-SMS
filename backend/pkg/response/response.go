package response

import (
	"math"

	"github.com/gofiber/fiber/v2"
)

// SuccessResponse is the standard success envelope.
type SuccessResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
}

// ErrorResponse is the standard error envelope.
type ErrorResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error"`
}

// PaginatedResponse is the standard paginated response envelope.
type PaginatedResponse struct {
	Success    bool        `json:"success"`
	Data       interface{} `json:"data"`
	Pagination Pagination  `json:"pagination"`
}

// Pagination holds page metadata.
type Pagination struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

// Success sends a 200 JSON response with a data payload.
func Success(c *fiber.Ctx, data interface{}) error {
	return c.JSON(SuccessResponse{
		Success: true,
		Data:    data,
	})
}

// Created sends a 201 JSON response with a data payload.
func Created(c *fiber.Ctx, data interface{}) error {
	return c.Status(fiber.StatusCreated).JSON(SuccessResponse{
		Success: true,
		Data:    data,
	})
}

// Error sends an error JSON response with the given status code.
func Error(c *fiber.Ctx, status int, message string) error {
	return c.Status(status).JSON(ErrorResponse{
		Success: false,
		Error:   message,
	})
}

// Paginated sends a 200 JSON response with pagination metadata.
func Paginated(c *fiber.Ctx, data interface{}, total int64, page, limit int) error {
	totalPages := int(math.Ceil(float64(total) / float64(limit)))

	return c.JSON(PaginatedResponse{
		Success: true,
		Data:    data,
		Pagination: Pagination{
			Page:       page,
			Limit:      limit,
			Total:      total,
			TotalPages: totalPages,
		},
	})
}
