package services

import (
	"errors"
	"fmt"

	"backend/internal/models"
	"backend/internal/repository"
	"backend/pkg/storage"

	"golang.org/x/crypto/bcrypt"
)

// UserService handles User CRUD business logic.
type UserService struct {
	userRepo        *repository.UserRepository
	storageProvider storage.StorageProvider
}

// NewUserService creates a new UserService.
func NewUserService(userRepo *repository.UserRepository, storageProvider storage.StorageProvider) *UserService {
	return &UserService{userRepo: userRepo, storageProvider: storageProvider}
}

// GetAllUsers lists all users in the system.
func (s *UserService) GetAllUsers() ([]models.UserResponse, error) {
	users, err := s.userRepo.FindAll()
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve users: %w", err)
	}

	res := make([]models.UserResponse, 0, len(users))
	for _, u := range users {
		res = append(res, u.ToResponse())
	}
	return res, nil
}

// GetUserByID returns details of a single user.
func (s *UserService) GetUserByID(id uint) (*models.UserResponse, error) {
	user, err := s.userRepo.FindByID(id)
	if err != nil {
		return nil, errors.New("user not found")
	}

	res := user.ToResponse()
	return &res, nil
}

// UpdateProfile updates the authenticated user's editable profile fields.
func (s *UserService) UpdateProfile(id uint, name, email string) (*models.UserResponse, error) {
	user, err := s.userRepo.FindByID(id)
	if err != nil {
		return nil, errors.New("user not found")
	}

	if user.Email != email {
		existing, _ := s.userRepo.FindByEmail(email)
		if existing != nil {
			return nil, errors.New("Email address already taken")
		}
	}

	user.Name = name
	user.Email = email

	if err := s.userRepo.Update(user); err != nil {
		return nil, fmt.Errorf("failed to update profile: %w", err)
	}

	res := user.ToResponse()
	return &res, nil
}

// CreateUser creates a new user directly (Admin function).
func (s *UserService) CreateUser(req *models.CreateUserRequest) (*models.UserResponse, error) {
	existing, _ := s.userRepo.FindByEmail(req.Email)
	if existing != nil {
		return nil, errors.New("Email address already taken")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	user := &models.User{
		Name:       req.Name,
		Email:      req.Email,
		Password:   string(hashedPassword),
		Role:       req.Role,
		SMSBalance: req.SMSBalance,
		IsVerified: true, // Admin created users are verified by default
	}

	if err := s.userRepo.Create(user); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	res := user.ToResponse()
	return &res, nil
}

// UpdateUser updates user details.
func (s *UserService) UpdateUser(id uint, req *models.UpdateUserRequest) (*models.UserResponse, error) {
	user, err := s.userRepo.FindByID(id)
	if err != nil {
		return nil, errors.New("user not found")
	}

	// Email duplicate check
	if user.Email != req.Email {
		existing, _ := s.userRepo.FindByEmail(req.Email)
		if existing != nil {
			return nil, errors.New("Email address already taken")
		}
	}

	user.Name = req.Name
	user.Email = req.Email
	user.Role = req.Role
	user.SMSBalance = req.SMSBalance

	// Hash password only if a new one was provided
	if req.Password != "" {
		hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("failed to hash password: %w", err)
		}
		user.Password = string(hashed)
	}

	if err := s.userRepo.Update(user); err != nil {
		return nil, fmt.Errorf("failed to update user: %w", err)
	}

	res := user.ToResponse()
	return &res, nil
}

// DeleteUser removes a user.
func (s *UserService) DeleteUser(id uint) error {
	_, err := s.userRepo.FindByID(id)
	if err != nil {
		return errors.New("user not found")
	}
	return s.userRepo.Delete(id)
}

// UploadProfileImage uploads user's profile image using active storage provider.
func (s *UserService) UploadProfileImage(id uint, fileName string, content []byte, contentType string) (*models.UserResponse, error) {
	user, err := s.userRepo.FindByID(id)
	if err != nil {
		return nil, errors.New("user not found")
	}

	// Upload using the pluggable storage provider (local folder or AWS S3 / Cloudflare R2)
	url, err := s.storageProvider.Upload(fileName, content, contentType)
	if err != nil {
		return nil, fmt.Errorf("failed to upload profile image: %w", err)
	}

	user.ProfileImage = url
	if err := s.userRepo.Update(user); err != nil {
		return nil, fmt.Errorf("failed to save profile image: %w", err)
	}

	res := user.ToResponse()
	return &res, nil
}
