package models

import (
	"time"

	"gorm.io/gorm"
)

// WhatsApp providers supported by the WhatsApp service.
const (
	WhatsAppProviderWhatsmeow = "whatsmeow" // WhatsApp Web multi-device session linked by QR / pairing code
	WhatsAppProviderSandbox   = "sandbox"   // Simulated delivery for UI testing, no external calls
)

// WhatsApp account statuses.
const (
	WhatsAppStatusPending      = "pending"      // waiting for the QR code / pairing code to be used
	WhatsAppStatusConnected    = "connected"    // linked and online
	WhatsAppStatusDisconnected = "disconnected" // linked but offline (reconnecting or replaced elsewhere)
	WhatsAppStatusLoggedOut    = "logged_out"   // unlinked from the phone; must be linked again
	WhatsAppStatusBanned       = "banned"       // temporarily banned by WhatsApp; sending paused
)

// WhatsApp message statuses.
const (
	WhatsAppMessageQueued    = "queued"
	WhatsAppMessageSending   = "sending"
	WhatsAppMessageSent      = "sent"
	WhatsAppMessageFailed    = "failed"
	WhatsAppMessageCancelled = "cancelled"
)

// WhatsAppAccount is a WhatsApp number linked by a user. Each account owns exactly one
// whatsmeow device session, identified by DeviceJID.
type WhatsAppAccount struct {
	ID              uint           `json:"id" gorm:"primaryKey"`
	UserID          uint           `json:"user_id" gorm:"index;not null"`
	Provider        string         `json:"provider" gorm:"not null;default:'whatsmeow'"`
	DisplayName     string         `json:"display_name"`
	PhoneNumber     string         `json:"phone_number"`
	DeviceJID       string         `json:"-" gorm:"column:device_jid;index"`
	PushName        string         `json:"push_name"`
	Status          string         `json:"status" gorm:"not null;default:'pending'"`
	LastError       string         `json:"last_error"`
	BannedUntil     *time.Time     `json:"banned_until"`
	LinkedAt        *time.Time     `json:"linked_at"`
	LastConnectedAt *time.Time     `json:"last_connected_at"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `json:"-" gorm:"index"`
}

// WhatsAppMessage is a single outbound WhatsApp message. Messages are queued and sent
// gradually by the account's worker.
type WhatsAppMessage struct {
	ID                uint       `json:"id" gorm:"primaryKey"`
	UserID            uint       `json:"user_id" gorm:"index;not null"`
	AccountID         uint       `json:"account_id" gorm:"index:idx_whatsapp_messages_account_status;not null"`
	Recipient         string     `json:"recipient" gorm:"not null"`
	Body              string     `json:"body" gorm:"type:text;not null"`
	ImageURL          string     `json:"image_url" gorm:"type:text"`
	Status            string     `json:"status" gorm:"index:idx_whatsapp_messages_account_status;not null"`
	ProviderMessageID string     `json:"provider_message_id"`
	ChargedFrom       string     `json:"charged_from"` // free, credit, or empty when not charged (sandbox/failed)
	Error             string     `json:"error"`
	SentAt            *time.Time `json:"sent_at" gorm:"index"`
	CreatedAt         time.Time  `json:"created_at"`
}

// ConnectWhatsAppRequest starts linking a WhatsApp number.
// For whatsmeow, leave PhoneNumber empty to link by QR code, or set it to receive an 8-character pairing code.
type ConnectWhatsAppRequest struct {
	Provider    string `json:"provider"`
	DisplayName string `json:"display_name"`
	PhoneNumber string `json:"phone_number"`
}

// PairWhatsAppRequest restarts linking for an existing account.
type PairWhatsAppRequest struct {
	PhoneNumber string `json:"phone_number"`
}

// WhatsAppPairingResponse reports progress of linking a number.
type WhatsAppPairingResponse struct {
	Account     WhatsAppAccountResponse `json:"account"`
	Status      string                  `json:"status"` // waiting, success, timeout, error, none
	QRCode      string                  `json:"qr_code"`
	PairingCode string                  `json:"pairing_code"`
	ExpiresAt   *time.Time              `json:"expires_at"`
	Error       string                  `json:"error"`
}

// SendWhatsAppRequest is the payload for sending a WhatsApp text message.
type SendWhatsAppRequest struct {
	AccountID uint     `json:"account_id"`
	Phones    []string `json:"phones"`
	Message   string   `json:"message"`
	WhatsAppRich
}

// WhatsAppButton is sent as a formatted, tappable line: WhatsApp only renders native buttons
// for the official Business API, not for linked devices.
type WhatsAppButton struct {
	Type  string `json:"type"` // url, call or reply
	Text  string `json:"text"`
	Value string `json:"value,omitempty"` // link or phone number
}

// WhatsAppRich holds the optional parts of a WhatsApp message around its body.
type WhatsAppRich struct {
	ImageURL string           `json:"image_url,omitempty"`
	Header   string           `json:"header,omitempty"`
	Footer   string           `json:"footer,omitempty"`
	Buttons  []WhatsAppButton `json:"buttons,omitempty"`
}

// SendWhatsAppResponse summarises a send request.
type SendWhatsAppResponse struct {
	Queued          int               `json:"queued"`
	Sent            int               `json:"sent"`
	Failed          int               `json:"failed"`
	ChargedFree     int               `json:"charged_free"`
	ChargedCredits  int               `json:"charged_credits"`
	WhatsAppBalance int               `json:"whatsapp_balance"`
	Messages        []WhatsAppMessage `json:"messages"`
}

// WhatsAppAccountResponse is the public shape of a linked account, including sending limits.
type WhatsAppAccountResponse struct {
	ID              uint       `json:"id"`
	Provider        string     `json:"provider"`
	DisplayName     string     `json:"display_name"`
	PhoneNumber     string     `json:"phone_number"`
	PushName        string     `json:"push_name"`
	Status          string     `json:"status"`
	Online          bool       `json:"online"`
	LastError       string     `json:"last_error"`
	BannedUntil     *time.Time `json:"banned_until"`
	LinkedAt        *time.Time `json:"linked_at"`
	LastConnectedAt *time.Time `json:"last_connected_at"`
	SentToday       int64      `json:"sent_today"`
	DailyLimit      int        `json:"daily_limit"`
	Queued          int64      `json:"queued"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// ToResponse formats a WhatsAppAccount without exposing session identifiers.
func (a *WhatsAppAccount) ToResponse() WhatsAppAccountResponse {
	return WhatsAppAccountResponse{
		ID:              a.ID,
		Provider:        a.Provider,
		DisplayName:     a.DisplayName,
		PhoneNumber:     a.PhoneNumber,
		PushName:        a.PushName,
		Status:          a.Status,
		LastError:       a.LastError,
		BannedUntil:     a.BannedUntil,
		LinkedAt:        a.LinkedAt,
		LastConnectedAt: a.LastConnectedAt,
		CreatedAt:       a.CreatedAt,
		UpdatedAt:       a.UpdatedAt,
	}
}

// WhatsAppGroupMember is a group participant whose phone number WhatsApp shares with the linked device.
type WhatsAppGroupMember struct {
	Phone   string `json:"phone"` // international digits, e.g. 256700000000
	IsAdmin bool   `json:"is_admin"`
}

// WhatsAppGroupResponse is a WhatsApp group the linked number belongs to.
type WhatsAppGroupResponse struct {
	JID              string                `json:"jid"`
	Name             string                `json:"name"`
	ParticipantCount int                   `json:"participant_count"`
	Members          []WhatsAppGroupMember `json:"members"`
	HiddenCount      int                   `json:"hidden_count"` // members whose number WhatsApp keeps private
}

// WhatsAppGroupsResponse is a (possibly cached) snapshot of a linked number's groups.
type WhatsAppGroupsResponse struct {
	Groups    []WhatsAppGroupResponse `json:"groups"`
	FetchedAt time.Time               `json:"fetched_at"` // when the list was last loaded from WhatsApp
	Cached    bool                    `json:"cached"`     // true when served from cache instead of WhatsApp
}
