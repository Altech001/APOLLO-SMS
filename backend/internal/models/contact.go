package models

import (
	"time"

	"gorm.io/gorm"
)

// Contact is a phone contact owned by a user. Phone is stored in international format (+256...).
type Contact struct {
	ID        uint           `json:"id" gorm:"column:id;primaryKey"`
	UserID    uint           `json:"user_id" gorm:"column:user_id;not null;index"`
	Name      string         `json:"name" gorm:"column:name;not null"`
	Phone     string         `json:"phone" gorm:"column:phone;not null"`
	Email     string         `json:"email" gorm:"column:email"`
	Notes     string         `json:"notes" gorm:"column:notes;type:text"`
	CreatedAt time.Time      `json:"created_at" gorm:"column:created_at"`
	UpdatedAt time.Time      `json:"updated_at" gorm:"column:updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"column:deleted_at;index"`
}

// ContactGroup is a named batch of a user's contacts.
type ContactGroup struct {
	ID          uint           `json:"id" gorm:"column:id;primaryKey"`
	UserID      uint           `json:"user_id" gorm:"column:user_id;not null;index"`
	Name        string         `json:"name" gorm:"column:name;not null"`
	Description string         `json:"description" gorm:"column:description"`
	Color       string         `json:"color" gorm:"column:color"`
	CreatedAt   time.Time      `json:"created_at" gorm:"column:created_at"`
	UpdatedAt   time.Time      `json:"updated_at" gorm:"column:updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"column:deleted_at;index"`
}

// ContactGroupMember links a contact to a group.
type ContactGroupMember struct {
	ContactID uint      `json:"contact_id" gorm:"column:contact_id;primaryKey"`
	GroupID   uint      `json:"group_id" gorm:"column:group_id;primaryKey;index"`
	CreatedAt time.Time `json:"created_at" gorm:"column:created_at"`
}

// TableName pins the join table name.
func (ContactGroupMember) TableName() string { return "contact_group_members" }

// ContactRequest creates or updates a contact.
type ContactRequest struct {
	Name     string `json:"name"`
	Phone    string `json:"phone"`
	Email    string `json:"email"`
	Notes    string `json:"notes"`
	GroupIDs []uint `json:"group_ids"`
}

// BulkContactsRequest imports many contacts at once, optionally adding them all to groups.
type BulkContactsRequest struct {
	Contacts []ContactRequest `json:"contacts"`
	GroupIDs []uint           `json:"group_ids"`
}

// BulkContactsResponse summarises an import.
type BulkContactsResponse struct {
	Created int      `json:"created"`
	Updated int      `json:"updated"`
	Skipped int      `json:"skipped"`
	Errors  []string `json:"errors"`
}

// ContactIDsRequest targets several contacts, e.g. for bulk delete or group assignment.
type ContactIDsRequest struct {
	ContactIDs []uint `json:"contact_ids"`
	GroupID    uint   `json:"group_id"`
}

// ContactGroupRequest creates or updates a group.
type ContactGroupRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Color       string `json:"color"`
}

// ContactResponse is a contact with the IDs of the groups it belongs to.
type ContactResponse struct {
	ID        uint      `json:"id"`
	Name      string    `json:"name"`
	Phone     string    `json:"phone"`
	Email     string    `json:"email"`
	Notes     string    `json:"notes"`
	GroupIDs  []uint    `json:"group_ids"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ContactGroupResponse is a group with its member count.
type ContactGroupResponse struct {
	ID           uint      `json:"id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	Color        string    `json:"color"`
	ContactCount int64     `json:"contact_count"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ContactListResponse is a page of contacts.
type ContactListResponse struct {
	Contacts []ContactResponse `json:"contacts"`
	Total    int64             `json:"total"`
}
