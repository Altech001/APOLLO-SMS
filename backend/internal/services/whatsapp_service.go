package services

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"backend/internal/config"
	"backend/internal/models"
	"backend/internal/repository"
	"backend/pkg/validator"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const whatsAppMaxMessageLength = 4096

var errWhatsAppDisabled = errors.New("WhatsApp sessions are not enabled on this server")

// WhatsAppService links user WhatsApp numbers (whatsmeow multi-device) and queues messages.
// It is independent of the SMS pipeline so it can be tested on its own.
type WhatsAppService struct {
	db           *gorm.DB
	billing      *BillingService
	repo         *repository.WhatsAppRepository
	notifService *NotificationService
	cfg          *config.Config
	sessions     *whatsAppSessionManager // nil when WhatsApp sessions are disabled
	groupsCache  *whatsAppGroupsCache
}

// NewWhatsAppService creates a new WhatsAppService and restores linked sessions.
func NewWhatsAppService(db *gorm.DB, billing *BillingService, repo *repository.WhatsAppRepository, notifService *NotificationService, redisService *RedisService, cfg *config.Config) *WhatsAppService {
	svc := &WhatsAppService{
		db:           db,
		billing:      billing,
		repo:         repo,
		notifService: notifService,
		cfg:          cfg,
		groupsCache:  newWhatsAppGroupsCache(redisService),
	}
	if !cfg.WhatsAppEnabled {
		log.Println("WhatsApp sessions disabled")
		return svc
	}

	sessions, err := newWhatsAppSessionManager(db, billing, repo, notifService, cfg)
	if err != nil {
		log.Printf("⚠️  WhatsApp sessions unavailable: %v", err)
		return svc
	}
	svc.sessions = sessions
	sessions.restore()
	return svc
}

// normalizeWhatsAppPhone returns the international digits-only format WhatsApp expects (e.g. 256700000000).
func normalizeWhatsAppPhone(phone string) (string, error) {
	formatted := FormatPhoneNumber(phone, "africastalking")
	if !validator.IsValidPhone(formatted) {
		return "", fmt.Errorf("invalid phone number: %s", phone)
	}
	return strings.TrimPrefix(formatted, "+"), nil
}

func (s *WhatsAppService) toResponse(account *models.WhatsAppAccount) models.WhatsAppAccountResponse {
	res := account.ToResponse()
	res.DailyLimit = s.cfg.WhatsAppDailyLimit
	if account.Provider == models.WhatsAppProviderSandbox {
		res.Online = true
	} else if s.sessions != nil {
		res.Online = s.sessions.isOnline(account.ID)
		res.DailyLimit = s.sessions.dailyLimit(account)
	}
	res.SentToday, _ = s.repo.CountSentSince(account.ID, startOfDay(time.Now()))
	res.Queued, _ = s.repo.CountQueued(account.ID)
	return res
}

func (s *WhatsAppService) pairingResponse(account *models.WhatsAppAccount, p *whatsAppPairing) *models.WhatsAppPairingResponse {
	return &models.WhatsAppPairingResponse{
		Account:     s.toResponse(account),
		Status:      p.Status,
		QRCode:      p.QRCode,
		PairingCode: p.PairingCode,
		ExpiresAt:   p.ExpiresAt,
		Error:       p.Error,
	}
}

func (s *WhatsAppService) ownedAccount(accountID, userID uint) (*models.WhatsAppAccount, error) {
	account, err := s.repo.FindAccountByID(accountID)
	if err != nil || account.UserID != userID {
		return nil, errors.New("WhatsApp account not found")
	}
	return account, nil
}

// Connect creates an account and starts linking it. Whatsmeow accounts return a QR code
// (and a pairing code when a phone number is given); sandbox accounts are ready immediately.
func (s *WhatsAppService) Connect(userID uint, req *models.ConnectWhatsAppRequest) (*models.WhatsAppPairingResponse, error) {
	provider := strings.ToLower(strings.TrimSpace(req.Provider))
	if provider == "" {
		provider = models.WhatsAppProviderWhatsmeow
	}
	if provider != models.WhatsAppProviderWhatsmeow && provider != models.WhatsAppProviderSandbox {
		return nil, fmt.Errorf("unsupported WhatsApp provider: %s", req.Provider)
	}

	count, err := s.repo.CountAccountsByUserID(userID)
	if err != nil {
		return nil, err
	}
	if count >= int64(s.cfg.WhatsAppMaxAccountsPerUser) {
		return nil, fmt.Errorf("you can link at most %d WhatsApp numbers", s.cfg.WhatsAppMaxAccountsPerUser)
	}

	var phone string
	if strings.TrimSpace(req.PhoneNumber) != "" {
		if phone, err = normalizeWhatsAppPhone(req.PhoneNumber); err != nil {
			return nil, err
		}
	}

	account := &models.WhatsAppAccount{
		UserID:      userID,
		Provider:    provider,
		DisplayName: strings.TrimSpace(req.DisplayName),
		PhoneNumber: phone,
		Status:      models.WhatsAppStatusPending,
	}

	if provider == models.WhatsAppProviderSandbox {
		if phone == "" {
			return nil, errors.New("phone number is required for a sandbox number")
		}
		now := time.Now()
		account.Status = models.WhatsAppStatusConnected
		account.LinkedAt = &now
		if err := s.repo.CreateAccount(account); err != nil {
			return nil, fmt.Errorf("failed to save WhatsApp account: %w", err)
		}
		return s.pairingResponse(account, &whatsAppPairing{Status: "success"}), nil
	}

	if s.sessions == nil {
		return nil, errWhatsAppDisabled
	}
	if err := s.repo.CreateAccount(account); err != nil {
		return nil, fmt.Errorf("failed to save WhatsApp account: %w", err)
	}

	pairing, err := s.sessions.startPairing(account, phone)
	if err != nil {
		_ = s.repo.DeleteAccount(account.ID)
		return nil, err
	}
	return s.pairingResponse(account, pairing), nil
}

// Pair restarts linking for an existing account (e.g. after it was logged out or the QR expired).
func (s *WhatsAppService) Pair(accountID, userID uint, req *models.PairWhatsAppRequest) (*models.WhatsAppPairingResponse, error) {
	account, err := s.ownedAccount(accountID, userID)
	if err != nil {
		return nil, err
	}
	if account.Provider != models.WhatsAppProviderWhatsmeow {
		return nil, errors.New("only linked WhatsApp numbers can be paired")
	}
	if s.sessions == nil {
		return nil, errWhatsAppDisabled
	}

	var phone string
	if strings.TrimSpace(req.PhoneNumber) != "" {
		if phone, err = normalizeWhatsAppPhone(req.PhoneNumber); err != nil {
			return nil, err
		}
	}

	pairing, err := s.sessions.startPairing(account, phone)
	if err != nil {
		return nil, err
	}
	// A re-link may attach a different phone, so its cached groups no longer apply.
	s.groupsCache.invalidate(account.ID)
	return s.pairingResponse(account, pairing), nil
}

// PairingStatus returns the current linking progress; clients poll it while showing the QR code.
func (s *WhatsAppService) PairingStatus(accountID, userID uint) (*models.WhatsAppPairingResponse, error) {
	account, err := s.ownedAccount(accountID, userID)
	if err != nil {
		return nil, err
	}
	pairing := &whatsAppPairing{Status: "none"}
	if s.sessions != nil {
		pairing = s.sessions.pairingSnapshot(account.ID)
	}
	return s.pairingResponse(account, pairing), nil
}

// Reconnect reopens the session of a linked account that went offline.
func (s *WhatsAppService) Reconnect(accountID, userID uint) (*models.WhatsAppAccountResponse, error) {
	account, err := s.ownedAccount(accountID, userID)
	if err != nil {
		return nil, err
	}
	if account.Provider != models.WhatsAppProviderWhatsmeow {
		res := s.toResponse(account)
		return &res, nil
	}
	if s.sessions == nil {
		return nil, errWhatsAppDisabled
	}
	if account.DeviceJID == "" {
		return nil, errors.New("this number is not linked; link it again with a QR code")
	}
	if account.BannedUntil != nil && time.Now().Before(*account.BannedUntil) {
		return nil, fmt.Errorf("this number is temporarily banned until %s", account.BannedUntil.Format(time.RFC1123))
	}

	if !s.sessions.isOnline(account.ID) {
		if err := s.sessions.resume(account); err != nil {
			return nil, fmt.Errorf("could not reconnect: %w", err)
		}
	}

	account, err = s.repo.FindAccountByID(account.ID)
	if err != nil {
		return nil, err
	}
	res := s.toResponse(account)
	return &res, nil
}

// ListAccounts returns all WhatsApp accounts linked by a user.
func (s *WhatsAppService) ListAccounts(userID uint) ([]models.WhatsAppAccountResponse, error) {
	accounts, err := s.repo.FindAccountsByUserID(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve WhatsApp accounts: %w", err)
	}

	res := make([]models.WhatsAppAccountResponse, len(accounts))
	for i := range accounts {
		res[i] = s.toResponse(&accounts[i])
	}
	return res, nil
}

// Disconnect unlinks the number from WhatsApp, deletes its session keys and removes the account.
func (s *WhatsAppService) Disconnect(accountID, userID uint) error {
	account, err := s.ownedAccount(accountID, userID)
	if err != nil {
		return err
	}

	if account.Provider == models.WhatsAppProviderWhatsmeow && s.sessions != nil {
		s.sessions.unlink(account)
	}
	if err := failQueuedWhatsApp(s.db, s.billing, account.ID, "Number was removed before this message was sent"); err != nil {
		return fmt.Errorf("failed to cancel queued messages: %w", err)
	}

	if err := s.repo.DeleteAccount(account.ID); err != nil {
		return fmt.Errorf("failed to remove WhatsApp account: %w", err)
	}
	s.groupsCache.invalidate(account.ID)

	label := account.PhoneNumber
	if label == "" {
		label = account.DisplayName
	}
	s.notifService.Notify(userID, "WhatsApp Disconnected", fmt.Sprintf("WhatsApp number %s was disconnected.", label), "warning")
	return nil
}

// Send validates recipients and queues a text message for each. Linked numbers send the queue
// gradually (random delay between messages, daily limit); sandbox numbers complete immediately.
func (s *WhatsAppService) Send(userID uint, req *models.SendWhatsAppRequest) (*models.SendWhatsAppResponse, error) {
	rich, err := normalizeWhatsAppRich(req.WhatsAppRich)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Message) == "" && rich.ImageURL == "" {
		return nil, errors.New("message is required")
	}
	message := composeWhatsAppText(req.Message, rich)
	if len(message) > whatsAppMaxMessageLength {
		return nil, fmt.Errorf("message exceeds %d characters", whatsAppMaxMessageLength)
	}
	if rich.ImageURL != "" && len([]rune(message)) > whatsAppMaxCaptionLength {
		return nil, fmt.Errorf("with an image, the text can be at most %d characters", whatsAppMaxCaptionLength)
	}
	if len(req.Phones) == 0 {
		return nil, errors.New("at least one recipient is required")
	}
	if len(req.Phones) > s.cfg.WhatsAppMaxRecipients {
		return nil, fmt.Errorf("a maximum of %d recipients is allowed per request", s.cfg.WhatsAppMaxRecipients)
	}

	account, err := s.ownedAccount(req.AccountID, userID)
	if err != nil {
		return nil, err
	}

	var sess *whatsAppSession
	if account.Provider == models.WhatsAppProviderWhatsmeow {
		if s.sessions == nil {
			return nil, errWhatsAppDisabled
		}
		if account.Status == models.WhatsAppStatusBanned {
			return nil, errors.New("this number is temporarily banned by WhatsApp; sending is paused")
		}
		sess = s.sessions.current(account.ID)
		if sess == nil || !sess.online() {
			return nil, fmt.Errorf("this number is not online (status: %s); reconnect or link it again", account.Status)
		}
	}

	res := &models.SendWhatsAppResponse{}
	messages := make([]models.WhatsAppMessage, 0, len(req.Phones))
	valid := make([]string, 0, len(req.Phones))
	seen := make(map[string]bool, len(req.Phones))

	newMessage := func(recipient, status, reason string) models.WhatsAppMessage {
		return models.WhatsAppMessage{
			UserID:    userID,
			AccountID: account.ID,
			Recipient: recipient,
			Body:      message,
			ImageURL:  rich.ImageURL,
			Status:    status,
			Error:     reason,
		}
	}

	for _, raw := range req.Phones {
		phone, err := normalizeWhatsAppPhone(raw)
		if err != nil {
			messages = append(messages, newMessage(strings.TrimSpace(raw), models.WhatsAppMessageFailed, err.Error()))
			continue
		}
		if !seen[phone] {
			seen[phone] = true
			valid = append(valid, phone)
		}
	}

	if sess == nil {
		// Sandbox: simulate an instant delivery.
		now := time.Now()
		for _, phone := range valid {
			msg := newMessage(phone, models.WhatsAppMessageSent, "")
			msg.ProviderMessageID = fmt.Sprintf("sandbox.%d.%s", now.UnixNano(), phone)
			msg.SentAt = &now
			messages = append(messages, msg)
		}
	} else {
		// Skip numbers that aren't on WhatsApp: sending to them fails anyway and counts against the number.
		registered, err := s.sessions.lookupRecipients(sess, valid)
		if err != nil {
			return nil, fmt.Errorf("could not check recipients on WhatsApp: %w", err)
		}
		for _, phone := range valid {
			if registered[phone] {
				messages = append(messages, newMessage(phone, models.WhatsAppMessageQueued, ""))
			} else {
				messages = append(messages, newMessage(phone, models.WhatsAppMessageFailed, "Number is not on WhatsApp"))
			}
		}
	}

	// Charge the queued messages and store everything in one transaction, so concurrent sends
	// can never spend the same credit. Free allowance is used first, then WhatsApp credits.
	queuedIdx := make([]int, 0, len(messages))
	for i := range messages {
		if messages[i].Status == models.WhatsAppMessageQueued {
			queuedIdx = append(queuedIdx, i)
		}
	}
	err = s.db.Transaction(func(tx *gorm.DB) error {
		if len(queuedIdx) > 0 && s.billing != nil {
			free, paid, balance, err := s.billing.ConsumeWhatsApp(tx, userID, len(queuedIdx))
			if err != nil {
				return err
			}
			for n, i := range queuedIdx {
				if n < free {
					messages[i].ChargedFrom = models.ChargeSourceFree
				} else {
					messages[i].ChargedFrom = models.ChargeSourceCredit
				}
			}
			res.ChargedFree, res.ChargedCredits, res.WhatsAppBalance = free, paid, balance
		}
		if len(messages) == 0 {
			return nil
		}
		return tx.Create(&messages).Error
	})
	if err != nil {
		if errors.Is(err, ErrWhatsAppPaymentRequired) {
			return nil, err
		}
		return nil, fmt.Errorf("failed to queue WhatsApp messages: %w", err)
	}
	if res.WhatsAppBalance == 0 && res.ChargedCredits == 0 {
		var user models.User
		if s.db.Select("whatsapp_balance").First(&user, userID).Error == nil {
			res.WhatsAppBalance = user.WhatsAppBalance
		}
	}
	for _, msg := range messages {
		switch msg.Status {
		case models.WhatsAppMessageQueued:
			res.Queued++
		case models.WhatsAppMessageSent:
			res.Sent++
		default:
			res.Failed++
		}
	}
	if sess != nil && res.Queued > 0 {
		sess.notify()
	}

	res.Messages = messages
	return res, nil
}

// CancelMessage cancels one of the user's queued messages and refunds its charge. The row lock means
// the send worker (which claims with SKIP LOCKED) can't pick it up mid-cancel; a message the worker has
// already claimed is "sending" and can no longer be cancelled.
func (s *WhatsAppService) CancelMessage(userID, messageID uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var msg models.WhatsAppMessage
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND user_id = ?", messageID, userID).First(&msg).Error; err != nil {
			return errors.New("message not found")
		}
		if msg.Status != models.WhatsAppMessageQueued {
			return fmt.Errorf("only queued messages can be cancelled; this one is %s", msg.Status)
		}
		if err := tx.Model(&msg).Updates(map[string]interface{}{
			"status": models.WhatsAppMessageCancelled,
			"error":  "Cancelled by you",
		}).Error; err != nil {
			return err
		}
		if s.billing == nil {
			return nil
		}
		return s.billing.RefundWhatsAppTx(tx, []models.WhatsAppMessage{msg})
	})
}

// ListGroups returns the WhatsApp groups a linked, online number belongs to.
// Results are cached (Redis, or memory as fallback); refresh=true reloads from WhatsApp, but no
// more than once per whatsAppGroupsMinRefresh per number, to keep the number from looking automated.
func (s *WhatsAppService) ListGroups(accountID, userID uint, refresh bool) (*models.WhatsAppGroupsResponse, error) {
	account, err := s.ownedAccount(accountID, userID)
	if err != nil {
		return nil, err
	}
	if account.Provider != models.WhatsAppProviderWhatsmeow {
		return nil, errors.New("groups are only available for linked WhatsApp numbers")
	}

	unlock := s.groupsCache.lock(account.ID)
	defer unlock()

	cached, hasCache := s.groupsCache.get(account.ID)
	if hasCache && (!refresh || time.Since(cached.FetchedAt) < whatsAppGroupsMinRefresh) {
		return &models.WhatsAppGroupsResponse{Groups: cached.Groups, FetchedAt: cached.FetchedAt, Cached: true}, nil
	}

	var sess *whatsAppSession
	if s.sessions != nil {
		sess = s.sessions.current(account.ID)
	}
	if sess == nil || !sess.online() {
		// Members' numbers don't depend on the session, so a stale list is still useful offline.
		if hasCache {
			return &models.WhatsAppGroupsResponse{Groups: cached.Groups, FetchedAt: cached.FetchedAt, Cached: true}, nil
		}
		if s.sessions == nil {
			return nil, errWhatsAppDisabled
		}
		return nil, errors.New("this number is offline; reconnect it to load its groups")
	}

	groups, err := s.sessions.listGroups(sess)
	if err != nil {
		if hasCache {
			return &models.WhatsAppGroupsResponse{Groups: cached.Groups, FetchedAt: cached.FetchedAt, Cached: true}, nil
		}
		return nil, fmt.Errorf("could not load WhatsApp groups: %w", err)
	}
	if groups == nil {
		groups = []models.WhatsAppGroupResponse{}
	}

	entry := cachedWhatsAppGroups{Groups: groups, FetchedAt: time.Now().UTC()}
	s.groupsCache.set(account.ID, entry)
	return &models.WhatsAppGroupsResponse{Groups: entry.Groups, FetchedAt: entry.FetchedAt}, nil
}

// ListMessages returns the most recent WhatsApp messages sent by a user.
func (s *WhatsAppService) ListMessages(userID uint, limit int) ([]models.WhatsAppMessage, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	return s.repo.FindMessagesByUserID(userID, limit)
}
