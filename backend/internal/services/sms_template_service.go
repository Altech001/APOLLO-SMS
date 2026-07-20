package services

import (
	"errors"
	"fmt"

	"backend/internal/models"
	"backend/internal/repository"
)

// SMSTemplateService handles business logic for SMS templates.
type SMSTemplateService struct {
	templateRepo *repository.SMSTemplateRepository
	notifService *NotificationService
}

// NewSMSTemplateService creates a new SMSTemplateService.
func NewSMSTemplateService(templateRepo *repository.SMSTemplateRepository, notifService *NotificationService) *SMSTemplateService {
	return &SMSTemplateService{
		templateRepo: templateRepo,
		notifService: notifService,
	}
}

// Create creates a new SMS template for a user.
func (s *SMSTemplateService) Create(userID uint, req *models.CreateSMSTemplateRequest) (*models.SMSTemplateResponse, error) {
	template := &models.SMSTemplate{
		UserID:   userID,
		Name:     req.Name,
		Category: req.Category,
		Body:     req.Body,
	}

	if err := s.templateRepo.Create(template); err != nil {
		return nil, fmt.Errorf("failed to create template: %w", err)
	}

	s.notifService.Notify(userID, "SMS Template Created", fmt.Sprintf("Template '%s' created successfully.", template.Name), "success")

	res := template.ToResponse()
	return &res, nil
}

// GetByID retrieves a single template, ensuring it belongs to the requesting user.
func (s *SMSTemplateService) GetByID(templateID, userID uint, isAdmin bool) (*models.SMSTemplateResponse, error) {
	template, err := s.templateRepo.FindByID(templateID)
	if err != nil {
		return nil, errors.New("template not found")
	}

	if template.UserID != userID && !isAdmin {
		return nil, errors.New("access denied")
	}

	res := template.ToResponse()
	return &res, nil
}

// GetAllForUser retrieves all SMS templates belonging to a user.
func (s *SMSTemplateService) GetAllForUser(userID uint) ([]models.SMSTemplateResponse, error) {
	templates, err := s.templateRepo.FindByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve templates: %w", err)
	}

	res := make([]models.SMSTemplateResponse, len(templates))
	for i, t := range templates {
		res[i] = t.ToResponse()
	}
	return res, nil
}

// Update modifies an existing SMS template, ensuring ownership.
func (s *SMSTemplateService) Update(templateID, userID uint, isAdmin bool, req *models.UpdateSMSTemplateRequest) (*models.SMSTemplateResponse, error) {
	template, err := s.templateRepo.FindByID(templateID)
	if err != nil {
		return nil, errors.New("template not found")
	}

	if template.UserID != userID && !isAdmin {
		return nil, errors.New("access denied")
	}

	template.Name = req.Name
	template.Category = req.Category
	template.Body = req.Body

	if err := s.templateRepo.Update(template); err != nil {
		return nil, fmt.Errorf("failed to update template: %w", err)
	}

	s.notifService.Notify(userID, "SMS Template Updated", fmt.Sprintf("Template '%s' was updated successfully.", template.Name), "success")

	res := template.ToResponse()
	return &res, nil
}

// Delete soft-deletes a template, ensuring ownership.
func (s *SMSTemplateService) Delete(templateID, userID uint, isAdmin bool) error {
	template, err := s.templateRepo.FindByID(templateID)
	if err != nil {
		return errors.New("template not found")
	}

	if template.UserID != userID && !isAdmin {
		return errors.New("access denied")
	}

	if err := s.templateRepo.Delete(templateID); err != nil {
		return fmt.Errorf("failed to delete template: %w", err)
	}

	s.notifService.Notify(userID, "SMS Template Deleted", fmt.Sprintf("Template '%s' was deleted successfully.", template.Name), "warning")

	return nil
}
