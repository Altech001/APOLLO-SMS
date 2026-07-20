package repository

import (
	"backend/internal/models"

	"gorm.io/gorm"
)

// UserRepository handles database operations for users.
type UserRepository struct {
	db *gorm.DB
}

// NewUserRepository creates a new UserRepository.
func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db: db}
}

// FindByID returns a user by ID.
func (r *UserRepository) FindByID(id uint) (*models.User, error) {
	var user models.User
	err := r.db.First(&user, id).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByEmail returns a user by email address.
func (r *UserRepository) FindByEmail(email string) (*models.User, error) {
	var user models.User
	err := r.db.Where("email = ?", email).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByVerificationToken returns a user by verification token.
func (r *UserRepository) FindByVerificationToken(token string) (*models.User, error) {
	var user models.User
	err := r.db.Where("verification_token = ?", token).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByPasswordResetToken returns a user by password reset token.
func (r *UserRepository) FindByPasswordResetToken(token string) (*models.User, error) {
	var user models.User
	err := r.db.Where("password_reset_token = ?", token).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// Create inserts a new user.
func (r *UserRepository) Create(user *models.User) error {
	return r.db.Create(user).Error
}

// Update saves changes to an existing user.
func (r *UserRepository) Update(user *models.User) error {
	return r.db.Save(user).Error
}

// FindAll returns all registered users.
func (r *UserRepository) FindAll() ([]models.User, error) {
	var users []models.User
	err := r.db.Find(&users).Error
	return users, err
}

// Delete soft deletes a user by ID.
func (r *UserRepository) Delete(id uint) error {
	return r.db.Delete(&models.User{}, id).Error
}
