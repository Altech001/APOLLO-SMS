package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"backend/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	contactListDefaultLimit = 500
	contactListMaxLimit     = 5000
	contactBulkMax          = 5000
)

// ContactService manages a user's contacts and contact groups. Every query is scoped to the user.
type ContactService struct {
	db *gorm.DB
}

// NewContactService creates a ContactService.
func NewContactService(db *gorm.DB) *ContactService {
	return &ContactService{db: db}
}

// normalizeContactPhone stores numbers in one international format (+256700000000) so they dedupe.
func normalizeContactPhone(phone string) (string, error) {
	digits, err := normalizeWhatsAppPhone(phone)
	if err != nil {
		return "", err
	}
	return "+" + digits, nil
}

func isUniqueViolation(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "SQLSTATE 23505") || strings.Contains(err.Error(), "duplicate key"))
}

// ── Contacts ───────────────────────────────────────────────────────────────

// ListContacts returns the user's contacts, optionally filtered by search text or group.
func (s *ContactService) ListContacts(userID uint, search string, groupID uint, limit, offset int) (*models.ContactListResponse, error) {
	if limit <= 0 {
		limit = contactListDefaultLimit
	}
	limit = min(limit, contactListMaxLimit)

	query := s.db.Model(&models.Contact{}).Where("contacts.user_id = ?", userID)
	if search = strings.TrimSpace(search); search != "" {
		like := "%" + strings.ToLower(search) + "%"
		query = query.Where("LOWER(contacts.name) LIKE ? OR contacts.phone LIKE ? OR LOWER(contacts.email) LIKE ?", like, like, like)
	}
	if groupID != 0 {
		query = query.Where("EXISTS (SELECT 1 FROM contact_group_members m WHERE m.contact_id = contacts.id AND m.group_id = ?)", groupID)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, err
	}
	var contacts []models.Contact
	if err := query.Order("LOWER(contacts.name) asc, contacts.id asc").Limit(limit).Offset(max(0, offset)).Find(&contacts).Error; err != nil {
		return nil, err
	}

	res, err := s.withGroupIDs(contacts)
	if err != nil {
		return nil, err
	}
	return &models.ContactListResponse{Contacts: res, Total: total}, nil
}

// withGroupIDs attaches group memberships to contacts using one query.
func (s *ContactService) withGroupIDs(contacts []models.Contact) ([]models.ContactResponse, error) {
	ids := make([]uint, len(contacts))
	for i, c := range contacts {
		ids[i] = c.ID
	}
	groupsByContact := map[uint][]uint{}
	if len(ids) > 0 {
		var members []models.ContactGroupMember
		if err := s.db.Joins("JOIN contact_groups g ON g.id = contact_group_members.group_id AND g.deleted_at IS NULL").
			Where("contact_group_members.contact_id IN ?", ids).Find(&members).Error; err != nil {
			return nil, err
		}
		for _, m := range members {
			groupsByContact[m.ContactID] = append(groupsByContact[m.ContactID], m.GroupID)
		}
	}

	res := make([]models.ContactResponse, len(contacts))
	for i, c := range contacts {
		groupIDs := groupsByContact[c.ID]
		if groupIDs == nil {
			groupIDs = []uint{}
		}
		res[i] = models.ContactResponse{
			ID: c.ID, Name: c.Name, Phone: c.Phone, Email: c.Email, Notes: c.Notes,
			GroupIDs: groupIDs, CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt,
		}
	}
	return res, nil
}

func (s *ContactService) contactResponse(contact *models.Contact) (*models.ContactResponse, error) {
	res, err := s.withGroupIDs([]models.Contact{*contact})
	if err != nil {
		return nil, err
	}
	return &res[0], nil
}

// ownedGroupIDs keeps only group IDs that belong to the user.
func ownedGroupIDs(tx *gorm.DB, userID uint, groupIDs []uint) ([]uint, error) {
	if len(groupIDs) == 0 {
		return nil, nil
	}
	var owned []uint
	err := tx.Model(&models.ContactGroup{}).Where("user_id = ? AND id IN ?", userID, groupIDs).Pluck("id", &owned).Error
	if err != nil {
		return nil, err
	}
	if len(owned) != len(uniqueUints(groupIDs)) {
		return nil, errors.New("one or more groups were not found")
	}
	return owned, nil
}

func uniqueUints(values []uint) []uint {
	seen := make(map[uint]bool, len(values))
	out := make([]uint, 0, len(values))
	for _, v := range values {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}

func addMemberships(tx *gorm.DB, contactIDs, groupIDs []uint) error {
	if len(contactIDs) == 0 || len(groupIDs) == 0 {
		return nil
	}
	now := time.Now()
	rows := make([]models.ContactGroupMember, 0, len(contactIDs)*len(groupIDs))
	for _, c := range contactIDs {
		for _, g := range groupIDs {
			rows = append(rows, models.ContactGroupMember{ContactID: c, GroupID: g, CreatedAt: now})
		}
	}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).CreateInBatches(rows, 500).Error
}

func validateContactRequest(req *models.ContactRequest) (name, phone string, err error) {
	name = strings.TrimSpace(req.Name)
	phone, err = normalizeContactPhone(req.Phone)
	if err != nil {
		return "", "", err
	}
	if name == "" {
		name = phone
	}
	return name, phone, nil
}

// CreateContact adds a contact; the phone number must be unique among the user's contacts.
func (s *ContactService) CreateContact(userID uint, req *models.ContactRequest) (*models.ContactResponse, error) {
	name, phone, err := validateContactRequest(req)
	if err != nil {
		return nil, err
	}
	contact := &models.Contact{UserID: userID, Name: name, Phone: phone, Email: strings.TrimSpace(req.Email), Notes: strings.TrimSpace(req.Notes)}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		groupIDs, err := ownedGroupIDs(tx, userID, req.GroupIDs)
		if err != nil {
			return err
		}
		if err := tx.Create(contact).Error; err != nil {
			if isUniqueViolation(err) {
				return fmt.Errorf("a contact with phone %s already exists", phone)
			}
			return err
		}
		return addMemberships(tx, []uint{contact.ID}, groupIDs)
	})
	if err != nil {
		return nil, err
	}
	return s.contactResponse(contact)
}

// UpdateContact edits a contact. GroupIDs replaces its groups when present (an empty list clears them).
func (s *ContactService) UpdateContact(userID, contactID uint, req *models.ContactRequest) (*models.ContactResponse, error) {
	name, phone, err := validateContactRequest(req)
	if err != nil {
		return nil, err
	}
	var contact models.Contact
	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ? AND user_id = ?", contactID, userID).First(&contact).Error; err != nil {
			return errors.New("contact not found")
		}
		contact.Name, contact.Phone = name, phone
		contact.Email, contact.Notes = strings.TrimSpace(req.Email), strings.TrimSpace(req.Notes)
		if err := tx.Save(&contact).Error; err != nil {
			if isUniqueViolation(err) {
				return fmt.Errorf("a contact with phone %s already exists", phone)
			}
			return err
		}
		if req.GroupIDs == nil {
			return nil
		}
		groupIDs, err := ownedGroupIDs(tx, userID, req.GroupIDs)
		if err != nil {
			return err
		}
		if err := tx.Where("contact_id = ?", contact.ID).Delete(&models.ContactGroupMember{}).Error; err != nil {
			return err
		}
		return addMemberships(tx, []uint{contact.ID}, groupIDs)
	})
	if err != nil {
		return nil, err
	}
	return s.contactResponse(&contact)
}

// DeleteContacts removes contacts and their group memberships.
func (s *ContactService) DeleteContacts(userID uint, contactIDs []uint) (int64, error) {
	if len(contactIDs) == 0 {
		return 0, errors.New("no contacts selected")
	}
	var deleted int64
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var owned []uint
		if err := tx.Model(&models.Contact{}).Where("user_id = ? AND id IN ?", userID, contactIDs).Pluck("id", &owned).Error; err != nil {
			return err
		}
		if len(owned) == 0 {
			return errors.New("contact not found")
		}
		if err := tx.Where("contact_id IN ?", owned).Delete(&models.ContactGroupMember{}).Error; err != nil {
			return err
		}
		result := tx.Where("id IN ?", owned).Delete(&models.Contact{})
		deleted = result.RowsAffected
		return result.Error
	})
	return deleted, err
}

// BulkUpsertContacts imports contacts. Numbers that already exist are updated (name/email when given)
// instead of duplicated, and every imported contact is added to req.GroupIDs.
func (s *ContactService) BulkUpsertContacts(userID uint, req *models.BulkContactsRequest) (*models.BulkContactsResponse, error) {
	if len(req.Contacts) == 0 {
		return nil, errors.New("no contacts to import")
	}
	if len(req.Contacts) > contactBulkMax {
		return nil, fmt.Errorf("import at most %d contacts at a time", contactBulkMax)
	}

	res := &models.BulkContactsResponse{Errors: []string{}}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		sharedGroups, err := ownedGroupIDs(tx, userID, req.GroupIDs)
		if err != nil {
			return err
		}

		// Normalise and dedupe the batch itself first.
		type entry struct {
			req   models.ContactRequest
			name  string
			phone string
		}
		byPhone := map[string]*entry{}
		order := []string{}
		for i := range req.Contacts {
			name, phone, err := validateContactRequest(&req.Contacts[i])
			if err != nil {
				res.Skipped++
				if len(res.Errors) < 20 {
					res.Errors = append(res.Errors, err.Error())
				}
				continue
			}
			if _, ok := byPhone[phone]; !ok {
				order = append(order, phone)
			}
			byPhone[phone] = &entry{req: req.Contacts[i], name: name, phone: phone}
		}
		if len(order) == 0 {
			return nil
		}

		var existing []models.Contact
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ? AND phone IN ?", userID, order).Find(&existing).Error; err != nil {
			return err
		}
		existingByPhone := make(map[string]*models.Contact, len(existing))
		for i := range existing {
			existingByPhone[existing[i].Phone] = &existing[i]
		}

		contactGroups := map[uint][]uint{}
		for _, phone := range order {
			e := byPhone[phone]
			perContactGroups, err := ownedGroupIDs(tx, userID, e.req.GroupIDs)
			if err != nil {
				return err
			}
			if c, ok := existingByPhone[phone]; ok {
				updates := map[string]interface{}{}
				if strings.TrimSpace(e.req.Name) != "" && e.name != c.Name {
					updates["name"] = e.name
				}
				if email := strings.TrimSpace(e.req.Email); email != "" && email != c.Email {
					updates["email"] = email
				}
				if len(updates) > 0 {
					if err := tx.Model(c).Updates(updates).Error; err != nil {
						return err
					}
				}
				res.Updated++
				contactGroups[c.ID] = append(perContactGroups, sharedGroups...)
				continue
			}
			contact := models.Contact{UserID: userID, Name: e.name, Phone: phone, Email: strings.TrimSpace(e.req.Email), Notes: strings.TrimSpace(e.req.Notes)}
			if err := tx.Create(&contact).Error; err != nil {
				return err
			}
			res.Created++
			contactGroups[contact.ID] = append(perContactGroups, sharedGroups...)
		}

		for contactID, groupIDs := range contactGroups {
			if err := addMemberships(tx, []uint{contactID}, uniqueUints(groupIDs)); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

// SetGroupMembership adds (or removes) contacts to a group.
func (s *ContactService) SetGroupMembership(userID uint, req *models.ContactIDsRequest, add bool) error {
	if len(req.ContactIDs) == 0 || req.GroupID == 0 {
		return errors.New("contact_ids and group_id are required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		if _, err := ownedGroupIDs(tx, userID, []uint{req.GroupID}); err != nil {
			return err
		}
		var owned []uint
		if err := tx.Model(&models.Contact{}).Where("user_id = ? AND id IN ?", userID, req.ContactIDs).Pluck("id", &owned).Error; err != nil {
			return err
		}
		if len(owned) == 0 {
			return errors.New("contact not found")
		}
		if add {
			return addMemberships(tx, owned, []uint{req.GroupID})
		}
		return tx.Where("group_id = ? AND contact_id IN ?", req.GroupID, owned).Delete(&models.ContactGroupMember{}).Error
	})
}

// ── Groups ─────────────────────────────────────────────────────────────────

// ListGroups returns the user's groups with the number of (non-deleted) contacts in each.
func (s *ContactService) ListGroups(userID uint) ([]models.ContactGroupResponse, error) {
	var groups []models.ContactGroup
	if err := s.db.Where("user_id = ?", userID).Order("LOWER(name) asc").Find(&groups).Error; err != nil {
		return nil, err
	}
	type countRow struct {
		GroupID uint
		Count   int64
	}
	var counts []countRow
	if len(groups) > 0 {
		if err := s.db.Table("contact_group_members m").
			Select("m.group_id AS group_id, COUNT(*) AS count").
			Joins("JOIN contacts c ON c.id = m.contact_id AND c.deleted_at IS NULL").
			Joins("JOIN contact_groups g ON g.id = m.group_id AND g.user_id = ?", userID).
			Group("m.group_id").Scan(&counts).Error; err != nil {
			return nil, err
		}
	}
	countByGroup := make(map[uint]int64, len(counts))
	for _, c := range counts {
		countByGroup[c.GroupID] = c.Count
	}

	res := make([]models.ContactGroupResponse, len(groups))
	for i, g := range groups {
		res[i] = groupResponse(&g, countByGroup[g.ID])
	}
	return res, nil
}

func groupResponse(g *models.ContactGroup, count int64) models.ContactGroupResponse {
	return models.ContactGroupResponse{
		ID: g.ID, Name: g.Name, Description: g.Description, Color: g.Color,
		ContactCount: count, CreatedAt: g.CreatedAt, UpdatedAt: g.UpdatedAt,
	}
}

func validateGroupRequest(req *models.ContactGroupRequest) (string, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return "", errors.New("group name is required")
	}
	if len(name) > 100 {
		return "", errors.New("group name is too long (max 100 characters)")
	}
	return name, nil
}

// CreateGroup adds a contact group.
func (s *ContactService) CreateGroup(userID uint, req *models.ContactGroupRequest) (*models.ContactGroupResponse, error) {
	name, err := validateGroupRequest(req)
	if err != nil {
		return nil, err
	}
	group := &models.ContactGroup{UserID: userID, Name: name, Description: strings.TrimSpace(req.Description), Color: req.Color}
	if err := s.db.Create(group).Error; err != nil {
		return nil, err
	}
	res := groupResponse(group, 0)
	return &res, nil
}

// UpdateGroup renames or recolours a group.
func (s *ContactService) UpdateGroup(userID, groupID uint, req *models.ContactGroupRequest) (*models.ContactGroupResponse, error) {
	name, err := validateGroupRequest(req)
	if err != nil {
		return nil, err
	}
	var group models.ContactGroup
	if err := s.db.Where("id = ? AND user_id = ?", groupID, userID).First(&group).Error; err != nil {
		return nil, errors.New("group not found")
	}
	group.Name, group.Description, group.Color = name, strings.TrimSpace(req.Description), req.Color
	if err := s.db.Save(&group).Error; err != nil {
		return nil, err
	}
	var count int64
	s.db.Table("contact_group_members m").Joins("JOIN contacts c ON c.id = m.contact_id AND c.deleted_at IS NULL").
		Where("m.group_id = ?", group.ID).Count(&count)
	res := groupResponse(&group, count)
	return &res, nil
}

// DeleteGroup removes a group. Its contacts are kept; only the memberships go.
func (s *ContactService) DeleteGroup(userID, groupID uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		result := tx.Where("id = ? AND user_id = ?", groupID, userID).Delete(&models.ContactGroup{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errors.New("group not found")
		}
		return tx.Where("group_id = ?", groupID).Delete(&models.ContactGroupMember{}).Error
	})
}
