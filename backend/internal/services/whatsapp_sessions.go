package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math/rand/v2"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"backend/internal/config"
	"backend/internal/models"
	"backend/internal/repository"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	whatsAppRestoreSpacing  = 3 * time.Second  // gap between reconnecting stored sessions on boot
	whatsAppWorkerInterval  = time.Minute      // how often an idle worker re-checks its queue
	whatsAppLookupChunkSize = 50               // numbers per IsOnWhatsApp query
	whatsAppLookupPause     = time.Second      // pause between IsOnWhatsApp queries
	whatsAppFirstCodeWait   = 10 * time.Second // how long a pairing request waits for the first QR code
	whatsAppSendTimeout     = 60 * time.Second
)

var nonDigits = regexp.MustCompile(`\D`)

// whatsAppPairing is the in-memory progress of linking a number.
type whatsAppPairing struct {
	Status      string // waiting, success, timeout, error
	QRCode      string
	PairingCode string
	ExpiresAt   *time.Time
	Error       string
}

// whatsAppSession is one live whatsmeow client. There is at most one per account.
type whatsAppSession struct {
	accountID uint
	userID    uint
	client    *whatsmeow.Client
	wake      chan struct{}
	ctx       context.Context
	cancel    context.CancelFunc
}

func (s *whatsAppSession) notify() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

func (s *whatsAppSession) online() bool {
	return s.client.IsConnected() && s.client.IsLoggedIn()
}

// whatsAppSessionManager owns every whatsmeow session in this process. Device keys are
// stored in Postgres (whatsmeow_* tables), so sessions survive restarts, but only one
// process may hold a given session at a time.
type whatsAppSessionManager struct {
	container *sqlstore.Container
	db        *gorm.DB
	billing   *BillingService
	repo      *repository.WhatsAppRepository
	notif     *NotificationService
	cfg       *config.Config
	log       waLog.Logger

	mu       sync.Mutex
	sessions map[uint]*whatsAppSession
	pairings map[uint]*whatsAppPairing
	media    whatsAppMediaCache
}

func newWhatsAppSessionManager(db *gorm.DB, billing *BillingService, repo *repository.WhatsAppRepository, notif *NotificationService, cfg *config.Config) (*whatsAppSessionManager, error) {
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	logger := waLog.Stdout("WhatsApp", "WARN", true)
	container := sqlstore.NewWithDB(sqlDB, "postgres", logger.Sub("Store"))
	if err := container.Upgrade(context.Background()); err != nil {
		return nil, fmt.Errorf("failed to prepare WhatsApp session store: %w", err)
	}

	// Shown to users under WhatsApp → Linked devices.
	store.SetOSInfo("LucoSMS", [3]uint32{1, 0, 0})

	return &whatsAppSessionManager{
		container: container,
		db:        db,
		billing:   billing,
		repo:      repo,
		notif:     notif,
		cfg:       cfg,
		log:       logger,
		sessions:  make(map[uint]*whatsAppSession),
		pairings:  make(map[uint]*whatsAppPairing),
		media:     whatsAppMediaCache{items: map[string]cachedWhatsAppMedia{}},
	}, nil
}

// ── Session lifecycle ──────────────────────────────────────────────────────

func (m *whatsAppSessionManager) current(accountID uint) *whatsAppSession {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.sessions[accountID]
}

func (m *whatsAppSessionManager) isOnline(accountID uint) bool {
	sess := m.current(accountID)
	return sess != nil && sess.online()
}

// register replaces any existing session for the account with a new client and starts its worker.
func (m *whatsAppSessionManager) register(account *models.WhatsAppAccount, client *whatsmeow.Client) *whatsAppSession {
	m.stop(account.ID)

	ctx, cancel := context.WithCancel(context.Background())
	sess := &whatsAppSession{
		accountID: account.ID,
		userID:    account.UserID,
		client:    client,
		wake:      make(chan struct{}, 1),
		ctx:       ctx,
		cancel:    cancel,
	}
	client.AddEventHandler(func(evt interface{}) { m.handleEvent(sess, evt) })

	m.mu.Lock()
	m.sessions[account.ID] = sess
	m.mu.Unlock()

	go m.runWorker(sess)
	return sess
}

// stop disconnects a session without logging it out, keeping its keys for a later reconnect.
func (m *whatsAppSessionManager) stop(accountID uint) {
	m.mu.Lock()
	sess := m.sessions[accountID]
	delete(m.sessions, accountID)
	m.mu.Unlock()

	if sess != nil {
		sess.cancel()
		sess.client.Disconnect()
	}
}

// restore reconnects every linked account, spaced out so a restart doesn't open all sessions at once.
func (m *whatsAppSessionManager) restore() {
	if err := m.repo.FailMessagesWithStatus(0, models.WhatsAppMessageSending, "Interrupted by a server restart; not retried to avoid a duplicate"); err != nil {
		log.Printf("WhatsApp: failed to clean interrupted messages: %v", err)
	}

	accounts, err := m.repo.FindRestorableAccounts()
	if err != nil {
		log.Printf("WhatsApp: failed to load sessions: %v", err)
		return
	}

	go func() {
		for i := range accounts {
			if i > 0 {
				time.Sleep(whatsAppRestoreSpacing)
			}
			if err := m.resume(&accounts[i]); err != nil {
				log.Printf("WhatsApp: account %d not restored: %v", accounts[i].ID, err)
			}
		}
		if len(accounts) > 0 {
			log.Printf("WhatsApp: restored %d session(s)", len(accounts))
		}
	}()
}

// resume connects an already-linked account using its stored device keys.
func (m *whatsAppSessionManager) resume(account *models.WhatsAppAccount) error {
	if account.BannedUntil != nil && time.Now().Before(*account.BannedUntil) {
		m.resumeAfter(account.ID, time.Until(*account.BannedUntil))
		return nil
	}

	jid, err := types.ParseJID(account.DeviceJID)
	if err != nil || account.DeviceJID == "" {
		m.markLoggedOut(account.ID, "Stored session is invalid; link this number again")
		return errors.New("invalid stored session")
	}

	device, err := m.container.GetDevice(context.Background(), jid)
	if err != nil {
		return err
	}
	if device == nil {
		m.markLoggedOut(account.ID, "Session not found; link this number again")
		return errors.New("session not found")
	}

	client := whatsmeow.NewClient(device, m.log.Sub(fmt.Sprintf("Account%d", account.ID)))
	client.InitialAutoReconnect = true
	m.register(account, client)

	if err := client.Connect(); err != nil {
		_ = m.repo.UpdateAccountFields(account.ID, map[string]interface{}{
			"status":     models.WhatsAppStatusDisconnected,
			"last_error": err.Error(),
		})
		return err
	}
	return nil
}

// resumeAfter reconnects an account after a delay, unless it was relinked, removed or already online by then.
func (m *whatsAppSessionManager) resumeAfter(accountID uint, delay time.Duration) {
	time.AfterFunc(delay, func() {
		if m.current(accountID) != nil {
			return
		}
		account, err := m.repo.FindAccountByID(accountID)
		if err != nil || account.DeviceJID == "" || account.Status == models.WhatsAppStatusLoggedOut {
			return
		}
		if err := m.resume(account); err != nil {
			log.Printf("WhatsApp: account %d not resumed: %v", accountID, err)
		}
	})
}

// unlink logs the device out of WhatsApp (removing it from the phone's linked devices) and deletes its keys.
func (m *whatsAppSessionManager) unlink(account *models.WhatsAppAccount) {
	if sess := m.current(account.ID); sess != nil && sess.online() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		if err := sess.client.Logout(ctx); err != nil {
			log.Printf("WhatsApp: logout for account %d failed: %v", account.ID, err)
		}
		cancel()
	}
	m.stop(account.ID)
	m.deleteDevice(account.DeviceJID)

	m.mu.Lock()
	delete(m.pairings, account.ID)
	m.mu.Unlock()
}

func (m *whatsAppSessionManager) deleteDevice(deviceJID string) {
	if deviceJID == "" {
		return
	}
	jid, err := types.ParseJID(deviceJID)
	if err != nil {
		return
	}
	ctx := context.Background()
	if device, err := m.container.GetDevice(ctx, jid); err == nil && device != nil {
		if err := m.container.DeleteDevice(ctx, device); err != nil {
			log.Printf("WhatsApp: failed to delete device %s: %v", deviceJID, err)
		}
	}
}

func (m *whatsAppSessionManager) markLoggedOut(accountID uint, reason string) {
	_ = m.repo.UpdateAccountFields(accountID, map[string]interface{}{
		"status":     models.WhatsAppStatusLoggedOut,
		"device_jid": "",
		"last_error": reason,
	})
	m.failQueued(accountID, "Number was unlinked before this message was sent")
}

// failQueued cancels every queued message of an account and refunds what they were charged.
func (m *whatsAppSessionManager) failQueued(accountID uint, reason string) {
	if err := failQueuedWhatsApp(m.db, m.billing, accountID, reason); err != nil {
		log.Printf("WhatsApp: failed to cancel queued messages for account %d: %v", accountID, err)
	}
}

// failQueuedWhatsApp marks an account's queued messages failed and refunds them in one transaction.
func failQueuedWhatsApp(db *gorm.DB, billing *BillingService, accountID uint, reason string) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var messages []models.WhatsAppMessage
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("account_id = ? AND status = ?", accountID, models.WhatsAppMessageQueued).
			Find(&messages).Error; err != nil {
			return err
		}
		if len(messages) == 0 {
			return nil
		}
		ids := make([]uint, len(messages))
		for i, msg := range messages {
			ids[i] = msg.ID
		}
		if err := tx.Model(&models.WhatsAppMessage{}).Where("id IN ?", ids).
			Updates(map[string]interface{}{"status": models.WhatsAppMessageFailed, "error": reason}).Error; err != nil {
			return err
		}
		if billing == nil {
			return nil
		}
		return billing.RefundWhatsAppTx(tx, messages)
	})
}

// ── Pairing ────────────────────────────────────────────────────────────────

// startPairing creates a fresh device for the account and returns the first QR code (and pairing
// code when a phone number is given). Any previous session for the account is discarded.
func (m *whatsAppSessionManager) startPairing(account *models.WhatsAppAccount, phone string) (*whatsAppPairing, error) {
	m.stop(account.ID)
	m.deleteDevice(account.DeviceJID)
	if err := m.repo.UpdateAccountFields(account.ID, map[string]interface{}{
		"status":       models.WhatsAppStatusPending,
		"device_jid":   "",
		"last_error":   "",
		"banned_until": nil,
	}); err != nil {
		return nil, err
	}
	account.DeviceJID = ""

	m.mu.Lock()
	m.pairings[account.ID] = &whatsAppPairing{Status: "waiting"}
	m.mu.Unlock()

	client := whatsmeow.NewClient(m.container.NewDevice(), m.log.Sub(fmt.Sprintf("Account%d", account.ID)))
	sess := m.register(account, client)

	qrChan, err := client.GetQRChannel(sess.ctx)
	if err != nil {
		m.stop(account.ID)
		return nil, err
	}
	if err := client.Connect(); err != nil {
		m.stop(account.ID)
		return nil, fmt.Errorf("could not reach WhatsApp: %w", err)
	}
	go m.watchPairing(sess, qrChan)

	if phone != "" {
		code, err := client.PairPhone(sess.ctx, phone, true, whatsmeow.PairClientChrome, "Chrome (Linux)")
		if err != nil {
			m.stop(account.ID)
			return nil, fmt.Errorf("could not request a pairing code: %w", err)
		}
		m.updatePairing(account.ID, func(p *whatsAppPairing) { p.PairingCode = code })
	}

	deadline := time.Now().Add(whatsAppFirstCodeWait)
	for time.Now().Before(deadline) {
		p := m.pairingSnapshot(account.ID)
		if p.QRCode != "" || p.PairingCode != "" || p.Status != "waiting" {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	return m.pairingSnapshot(account.ID), nil
}

func (m *whatsAppSessionManager) watchPairing(sess *whatsAppSession, qrChan <-chan whatsmeow.QRChannelItem) {
	for item := range qrChan {
		switch item.Event {
		case whatsmeow.QRChannelEventCode:
			expires := time.Now().Add(item.Timeout)
			m.updatePairing(sess.accountID, func(p *whatsAppPairing) {
				p.QRCode = item.Code
				p.ExpiresAt = &expires
			})
		case whatsmeow.QRChannelSuccess.Event:
			m.updatePairing(sess.accountID, func(p *whatsAppPairing) {
				p.Status = "success"
				p.QRCode = ""
				p.PairingCode = ""
			})
		case whatsmeow.QRChannelTimeout.Event:
			m.failPairing(sess, "Linking timed out. Start again and scan the new QR code.")
		case whatsmeow.QRChannelEventError:
			reason := "Linking failed"
			if item.Error != nil {
				reason = item.Error.Error()
			}
			m.failPairing(sess, reason)
		default:
			if strings.HasPrefix(item.Event, "err-") {
				m.failPairing(sess, "Linking failed: "+item.Event)
			}
		}
	}
}

func (m *whatsAppSessionManager) failPairing(sess *whatsAppSession, reason string) {
	m.updatePairing(sess.accountID, func(p *whatsAppPairing) {
		p.Status = "error"
		if strings.Contains(reason, "timed out") {
			p.Status = "timeout"
		}
		p.Error = reason
		p.QRCode = ""
		p.PairingCode = ""
	})
	if m.current(sess.accountID) == sess {
		_ = m.repo.UpdateAccountFields(sess.accountID, map[string]interface{}{"last_error": reason})
		go m.stop(sess.accountID)
	}
}

func (m *whatsAppSessionManager) updatePairing(accountID uint, update func(p *whatsAppPairing)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if p := m.pairings[accountID]; p != nil {
		update(p)
	}
}

func (m *whatsAppSessionManager) pairingSnapshot(accountID uint) *whatsAppPairing {
	m.mu.Lock()
	defer m.mu.Unlock()
	if p := m.pairings[accountID]; p != nil {
		snapshot := *p
		return &snapshot
	}
	return &whatsAppPairing{Status: "none"}
}

// ── Events ─────────────────────────────────────────────────────────────────

func (m *whatsAppSessionManager) handleEvent(sess *whatsAppSession, rawEvt interface{}) {
	// Ignore late events from a session that has already been replaced or stopped.
	if m.current(sess.accountID) != sess {
		return
	}
	now := time.Now()

	switch evt := rawEvt.(type) {
	case *events.PairSuccess:
		fields := map[string]interface{}{
			"device_jid":   evt.ID.String(),
			"phone_number": evt.ID.User,
			"status":       models.WhatsAppStatusConnected,
			"last_error":   "",
			"linked_at":    now,
			"banned_until": nil,
		}
		if evt.BusinessName != "" {
			fields["push_name"] = evt.BusinessName
		}
		_ = m.repo.UpdateAccountFields(sess.accountID, fields)
		m.notif.Notify(sess.userID, "WhatsApp Linked", fmt.Sprintf("WhatsApp number +%s is now linked.", evt.ID.User), "success")

	case *events.Connected:
		fields := map[string]interface{}{
			"status":            models.WhatsAppStatusConnected,
			"last_error":        "",
			"last_connected_at": now,
			"banned_until":      nil,
		}
		if name := sess.client.Store.PushName; name != "" {
			fields["push_name"] = name
		}
		_ = m.repo.UpdateAccountFields(sess.accountID, fields)
		sess.notify()

	case *events.Disconnected:
		// whatsmeow reconnects automatically; only reflect it while the account was online.
		_ = m.repo.UpdateAccountFieldsIfStatus(sess.accountID, models.WhatsAppStatusConnected, map[string]interface{}{
			"status": models.WhatsAppStatusDisconnected,
		})

	case *events.LoggedOut:
		m.markLoggedOut(sess.accountID, fmt.Sprintf("Unlinked from WhatsApp (%v). Link this number again to keep sending.", evt.Reason))
		m.notif.Notify(sess.userID, "WhatsApp Unlinked", "Your WhatsApp number was logged out. Link it again to keep sending.", "warning")
		go m.stop(sess.accountID)

	case *events.StreamReplaced:
		_ = m.repo.UpdateAccountFields(sess.accountID, map[string]interface{}{
			"status":     models.WhatsAppStatusDisconnected,
			"last_error": "This session was opened somewhere else (another server instance?). Only one instance may run WhatsApp sessions.",
		})
		go m.stop(sess.accountID)

	case *events.TemporaryBan:
		fields := map[string]interface{}{
			"status":     models.WhatsAppStatusBanned,
			"last_error": evt.String(),
		}
		if evt.Expire > 0 {
			fields["banned_until"] = now.Add(evt.Expire)
			m.resumeAfter(sess.accountID, evt.Expire+time.Minute)
		}
		_ = m.repo.UpdateAccountFields(sess.accountID, fields)
		m.notif.Notify(sess.userID, "WhatsApp Temporarily Banned", "WhatsApp paused this number: "+evt.String()+". Queued messages will wait until it is lifted.", "warning")
		go m.stop(sess.accountID)

	case *events.ClientOutdated:
		_ = m.repo.UpdateAccountFields(sess.accountID, map[string]interface{}{
			"status":     models.WhatsAppStatusDisconnected,
			"last_error": "WhatsApp rejected this client version; the whatsmeow dependency must be updated.",
		})

	case *events.ConnectFailure:
		_ = m.repo.UpdateAccountFields(sess.accountID, map[string]interface{}{
			"last_error": fmt.Sprintf("Connection failed: %v %s", evt.Reason, evt.Message),
		})
	}
}

// ── Groups ─────────────────────────────────────────────────────────────────

// listGroups returns the groups the linked number belongs to, with members' phone numbers.
// Community parent groups are skipped (they have no chat members of their own), and the
// linked number itself is left out of each member list.
func (m *whatsAppSessionManager) listGroups(sess *whatsAppSession) ([]models.WhatsAppGroupResponse, error) {
	ctx, cancel := context.WithTimeout(sess.ctx, 30*time.Second)
	defer cancel()

	groups, err := sess.client.GetJoinedGroups(ctx)
	if err != nil {
		return nil, err
	}
	own := ""
	if sess.client.Store.ID != nil {
		own = sess.client.Store.ID.User
	}

	res := make([]models.WhatsAppGroupResponse, 0, len(groups))
	for _, g := range groups {
		if g == nil || g.IsParent {
			continue
		}
		group := models.WhatsAppGroupResponse{
			JID:              g.JID.String(),
			Name:             g.Name,
			ParticipantCount: len(g.Participants),
			Members:          make([]models.WhatsAppGroupMember, 0, len(g.Participants)),
		}
		seen := make(map[string]bool, len(g.Participants))
		for _, p := range g.Participants {
			phone := m.participantPhone(ctx, sess, p)
			if phone == "" {
				group.HiddenCount++
				continue
			}
			if phone == own || seen[phone] {
				continue
			}
			seen[phone] = true
			group.Members = append(group.Members, models.WhatsAppGroupMember{Phone: phone, IsAdmin: p.IsAdmin || p.IsSuperAdmin})
		}
		if group.Name == "" {
			group.Name = "Unnamed group"
		}
		res = append(res, group)
	}
	sort.Slice(res, func(i, j int) bool { return strings.ToLower(res[i].Name) < strings.ToLower(res[j].Name) })
	return res, nil
}

// participantPhone resolves a participant's phone number. Newer groups address members by LID
// (a private ID); those are mapped through whatsmeow's LID store, and stay hidden when unknown.
func (m *whatsAppSessionManager) participantPhone(ctx context.Context, sess *whatsAppSession, p types.GroupParticipant) string {
	if p.PhoneNumber.Server == types.DefaultUserServer && p.PhoneNumber.User != "" {
		return p.PhoneNumber.User
	}
	if p.JID.Server == types.DefaultUserServer && p.JID.User != "" {
		return p.JID.User
	}
	lid := p.LID
	if lid.IsEmpty() && p.JID.Server == types.HiddenUserServer {
		lid = p.JID
	}
	if !lid.IsEmpty() {
		if pn, err := sess.client.Store.LIDs.GetPNForLID(ctx, lid); err == nil && pn.User != "" {
			return pn.User
		}
	}
	return ""
}

// ── Sending ────────────────────────────────────────────────────────────────

func (m *whatsAppSessionManager) dailyLimit(account *models.WhatsAppAccount) int {
	warmup := time.Duration(m.cfg.WhatsAppWarmupDays) * 24 * time.Hour
	if account.LinkedAt != nil && time.Since(*account.LinkedAt) < warmup {
		return m.cfg.WhatsAppWarmupDailyLimit
	}
	return m.cfg.WhatsAppDailyLimit
}

func startOfDay(t time.Time) time.Time {
	y, mo, d := t.Date()
	return time.Date(y, mo, d, 0, 0, 0, 0, t.Location())
}

func (m *whatsAppSessionManager) nextDelay() time.Duration {
	lo, hi := m.cfg.WhatsAppMinDelay, m.cfg.WhatsAppMaxDelay
	if hi <= lo {
		return lo
	}
	return lo + time.Duration(rand.Int64N(int64(hi-lo)))
}

// lookupRecipients reports which numbers (international digits) are registered on WhatsApp.
func (m *whatsAppSessionManager) lookupRecipients(sess *whatsAppSession, phones []string) (map[string]bool, error) {
	registered := make(map[string]bool, len(phones))
	for start := 0; start < len(phones); start += whatsAppLookupChunkSize {
		if start > 0 {
			time.Sleep(whatsAppLookupPause)
		}
		end := min(start+whatsAppLookupChunkSize, len(phones))
		query := make([]string, 0, end-start)
		for _, phone := range phones[start:end] {
			query = append(query, "+"+phone)
		}

		ctx, cancel := context.WithTimeout(sess.ctx, 30*time.Second)
		results, err := sess.client.IsOnWhatsApp(ctx, query)
		cancel()
		if err != nil {
			return nil, err
		}
		for _, res := range results {
			if !res.IsIn {
				continue
			}
			registered[nonDigits.ReplaceAllString(res.Query, "")] = true
			if res.PhoneNumber.User != "" {
				registered[res.PhoneNumber.User] = true
			}
		}
	}
	return registered, nil
}

// runWorker sends an account's queued messages one at a time until its session stops.
func (m *whatsAppSessionManager) runWorker(sess *whatsAppSession) {
	ticker := time.NewTicker(whatsAppWorkerInterval)
	defer ticker.Stop()

	for {
		select {
		case <-sess.ctx.Done():
			return
		case <-sess.wake:
		case <-ticker.C:
		}
		m.drainQueue(sess)
	}
}

// failAndRefund marks a claimed message failed and returns its charge.
func (m *whatsAppSessionManager) failAndRefund(msg *models.WhatsAppMessage, reason string) {
	err := m.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.WhatsAppMessage{}).Where("id = ?", msg.ID).
			Updates(map[string]interface{}{"status": models.WhatsAppMessageFailed, "error": reason}).Error; err != nil {
			return err
		}
		if m.billing == nil {
			return nil
		}
		return m.billing.RefundWhatsAppTx(tx, []models.WhatsAppMessage{*msg})
	})
	if err != nil {
		log.Printf("WhatsApp: failed to record failure of message %d: %v", msg.ID, err)
	}
}

func (m *whatsAppSessionManager) drainQueue(sess *whatsAppSession) {
	for sess.ctx.Err() == nil && sess.online() {
		account, err := m.repo.FindAccountByID(sess.accountID)
		if err != nil || account.Status != models.WhatsAppStatusConnected {
			return
		}

		sentToday, err := m.repo.CountSentSince(account.ID, startOfDay(time.Now()))
		if err != nil || sentToday >= int64(m.dailyLimit(account)) {
			return // remaining messages wait for tomorrow's allowance
		}

		msg, err := m.repo.ClaimNextQueued(account.ID)
		if err != nil || msg == nil {
			return
		}

		ctx, cancel := context.WithTimeout(sess.ctx, whatsAppSendTimeout+whatsAppMediaTimeout)
		content, err := m.buildMessage(ctx, sess, msg)
		if err != nil {
			cancel()
			m.failAndRefund(msg, err.Error())
			continue
		}
		resp, err := sess.client.SendMessage(ctx, types.NewJID(msg.Recipient, types.DefaultUserServer), content)
		cancel()

		switch {
		case err == nil:
			sentAt := resp.Timestamp
			if sentAt.IsZero() {
				sentAt = time.Now()
			}
			_ = m.repo.UpdateMessageFields(msg.ID, map[string]interface{}{
				"status":              models.WhatsAppMessageSent,
				"provider_message_id": resp.ID,
				"sent_at":             sentAt,
				"error":               "",
			})
		case errors.Is(err, whatsmeow.ErrNotConnected) || errors.Is(err, whatsmeow.ErrNotLoggedIn) || sess.ctx.Err() != nil:
			// Session dropped before the message left; put it back for the next connection.
			_ = m.repo.UpdateMessageFields(msg.ID, map[string]interface{}{"status": models.WhatsAppMessageQueued})
			return
		default:
			m.failAndRefund(msg, err.Error())
		}

		select {
		case <-sess.ctx.Done():
			return
		case <-time.After(m.nextDelay()):
		}
	}
}
