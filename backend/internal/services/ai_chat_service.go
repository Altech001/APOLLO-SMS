package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"backend/internal/models"
)

// AIChatRecipientMessage is one personalised message in a send_personalized action.
type AIChatRecipientMessage struct {
	To      string `json:"to"` // phone number or contact name
	Message string `json:"message"`
}

// AIChatAction is something the assistant proposes; the user confirms it in the app before it runs.
type AIChatAction struct {
	// send_sms, send_whatsapp, send_personalized, send_from_file, create_template or generate_image
	Type string `json:"type"`
	// send_sms / send_whatsapp: phone numbers or contact names, and contact group names.
	Recipients []string `json:"recipients,omitempty"`
	Groups     []string `json:"groups,omitempty"`
	// Text to send. For send_from_file it may contain {Column} placeholders filled from each row.
	Message string `json:"message,omitempty"`
	// send_personalized / send_from_file: sms or whatsapp. create_template: the template channel.
	Channel string `json:"channel,omitempty"`
	// send_personalized: a different message per recipient.
	Items []AIChatRecipientMessage `json:"items,omitempty"`
	// send_from_file: the attached spreadsheet and the column holding phone numbers.
	Attachment  string `json:"attachment,omitempty"`
	PhoneColumn string `json:"phone_column,omitempty"`
	Prompt      string `json:"prompt,omitempty"`
	Aspect      string `json:"aspect,omitempty"`
	Source      string `json:"source,omitempty"` // stock (Pexels, default) or ai
	// WhatsApp extras for send_whatsapp, send_personalized, send_from_file and create_template.
	Header     string                  `json:"header,omitempty"`
	Footer     string                  `json:"footer,omitempty"`
	Buttons    []models.WhatsAppButton `json:"buttons,omitempty"`
	ImageQuery string                  `json:"image_query,omitempty"`
	Query      string                  `json:"query,omitempty"` // stock photo search keywords
	// create_template
	Name     string `json:"name,omitempty"`
	Category string `json:"category,omitempty"`
	Content  string `json:"content,omitempty"`
}

// AIChatAttachment is a file the user attached. The app extracts it in the browser and sends
// only a summary: a document's text, or a spreadsheet's columns and first rows.
type AIChatAttachment struct {
	Name    string   `json:"name"`
	Kind    string   `json:"kind"` // spreadsheet or document
	Columns []string `json:"columns,omitempty"`
	Rows    int      `json:"rows,omitempty"`
	Text    string   `json:"text"`
}

// AIChatMessage is one turn of the conversation. Assistant turns carry the actions they proposed.
type AIChatMessage struct {
	Role        string             `json:"role"` // user or assistant
	Content     string             `json:"content"`
	Attachments []AIChatAttachment `json:"attachments,omitempty"`
	Actions     []AIChatAction     `json:"actions,omitempty"`
}

// AIChatRequest is the conversation so far, oldest first, ending with the user's new message.
type AIChatRequest struct {
	Messages []AIChatMessage `json:"messages"`
	// Think asks the model to reason before answering; slower but better for multi-step tasks.
	Think bool `json:"think"`
	// Images lets the assistant draw images (the "Image" toggle in the app, on by default).
	Images bool `json:"images"`
	// Model is the user's preferred model; empty means Auto. Other models take over if it's busy.
	Model string `json:"model"`
}

// AIChatResponse is the assistant's answer.
type AIChatResponse struct {
	Reply    string         `json:"reply"`
	Model    string         `json:"model,omitempty"` // the model that answered (a fallback may not reason)
	Thinking string         `json:"thinking,omitempty"`
	Plan     []string       `json:"plan,omitempty"`
	Actions  []AIChatAction `json:"actions"`
}

const (
	aiChatMaxTurns          = 20
	aiChatMaxTurnLength     = 4000
	aiChatMaxAttachmentText = 12000
	aiChatMaxActions        = 5
	aiChatMaxRecipients     = 500
	aiChatMaxItems          = 500
	aiChatContextContacts   = 300
	aiChatContextHistory    = 15
)

// AIChatService runs the in-app assistant. It gives the model the user's own account context
// (balances, contacts, groups, recent messages) so it can plan sends without asking for details.
type AIChatService struct {
	ai       *AITemplateService
	contacts *ContactService
	sms      *DeveloperKeyService
	whatsapp *WhatsAppService
	billing  *BillingService
}

// NewAIChatService creates an AIChatService.
func NewAIChatService(ai *AITemplateService, contacts *ContactService, sms *DeveloperKeyService, whatsapp *WhatsAppService, billing *BillingService) *AIChatService {
	return &AIChatService{ai: ai, contacts: contacts, sms: sms, whatsapp: whatsapp, billing: billing}
}

const aiChatInstructions = `You are Apollo, the assistant inside ApolloSMS, a business messaging platform in Uganda for bulk SMS and WhatsApp.
You help the user write messages, design images for campaigns, plan campaigns, read the documents and spreadsheets they attach, answer questions about their contacts, history and balance, send SMS and WhatsApp messages, and create reusable templates.

You cannot send anything yourself. Propose actions; the app shows each as a card with the cost in UGX, and the user reviews, edits and confirms it. Sending is billed to the user's balance.
Actions:
- {"type": "send_sms", "recipients": [...], "groups": [...], "message": "..."}: the same SMS to everyone. Plain text, no emojis or markdown; 160 characters is one SMS part and each part costs one credit.
- {"type": "send_whatsapp", "recipients": [...], "groups": [...], "message": "..."}: the same WhatsApp message to everyone. May use *bold*, _italic_ and line breaks.
- {"type": "send_personalized", "channel": "sms|whatsapp", "items": [{"to": "...", "message": "..."}]}: a different message for each recipient, when you write each message yourself (up to 500).
- {"type": "send_from_file", "channel": "sms|whatsapp", "attachment": "<file name>", "phone_column": "<column with phone numbers>", "message": "Hi {Name}, your balance is UGX {Amount}"}: mail-merge over EVERY row of an attached spreadsheet. Placeholders are column names in curly braces, spelled exactly as in the file. Use this for files instead of copying rows into items; you only see the first rows, the app fills in all of them.
- {"type": "create_template", "name": "...", "category": "Authentication|Marketing|Transactional|Alert", "channel": "sms|whatsapp", "content": "..."}: placeholders like {name}, {amount}, {date}; WhatsApp marketing templates end with "Reply STOP to opt out."
- {"type": "generate_image", "source": "stock|ai", "query": "...", "prompt": "...", "aspect": "square|landscape|portrait"}: shows an image right away. Use source "stock" by default: the app finds real photos on Pexels using "query" (2-5 English keywords naming what's in the photo, e.g. "fresh orange juice glasses"). Use source "ai" only when the user asks for an AI-generated, drawn or custom image, an illustration, cartoon or logo, or says the stock photos don't fit. Always also write "prompt": a detailed English visual description (subject, setting, style, colours, lighting, composition) used for AI images; avoid text in AI images. The query must name the subject of the user's message and audience (e.g. for a parents' meeting about early childhood education: "parents children classroom Africa"); when people appear, prefer African context. Use portrait for flyers, posters and WhatsApp status, landscape for banners. Propose up to 3 images when the user asks for options.
WhatsApp extras (send_whatsapp, WhatsApp send_personalized / send_from_file, WhatsApp create_template), all optional: "header" (bold title, max 60 chars), "footer" (small italic line, e.g. business name or "Reply STOP to opt out"), "buttons" (max 3: {"type": "url", "text": "Order now", "value": "https://..."}, {"type": "call", "text": "Call us", "value": "+256..."}, {"type": "reply", "text": "Yes, I'll attend"}; max 25 chars of text), "image_query" (2-5 keywords for a banner photo shown above the message). Use them for promotions, invitations and announcements. Only use links and phone numbers the user gave or that appear in the conversation; otherwise use reply buttons. Buttons appear as tappable lines, not native WhatsApp buttons.
Recipients are phone numbers (0772123456 or +256772123456) or contact names from the contact list below; groups are contact group names from the list below.
Only propose a send when the user asked to send. Never invent phone numbers; if you don't know who to send to, ask. If the channel is unclear, ask whether they want SMS, WhatsApp or both; for both, propose one action per channel, each written for its channel.
Use the balances below to tell the user roughly what a send costs and whether they need to top up first. When the user asks to change a proposed message, propose the updated action again.
For tasks with several steps (a file campaign, several groups, both channels), include a short "plan": the steps you'll take, in order.

Respond with ONLY a JSON object, no code fences:
{"reply": "<your answer; markdown allowed (headings, lists, tables, bold); when you propose actions, say briefly what the cards contain>", "plan": ["<step>", ...], "actions": [<zero or more actions>]}`

const aiChatImagesOnInstructions = `
IMAGE GENERATION IS ON: you CAN provide images (stock photos by default, AI-generated when asked). When the user asks for a flyer, poster, banner, picture, photo, logo, artwork, design or WhatsApp status image, ALWAYS include a generate_image action. Never say you can't create or find images.`

const aiChatImagesOffInstructions = `
IMAGE GENERATION IS OFF: don't propose generate_image. If the user asks for an image, tell them to switch on "Image" in the message box.`

const aiChatThinkingInstructions = `
Think it through before answering: check the recipients, placeholders, cost and balance. Add a "thinking" field to the JSON with your reasoning in a few short sentences.`

// accountContext describes the user's account to the model. Parts that fail to load are left out.
func (s *AIChatService) accountContext(userID uint) string {
	var b strings.Builder
	b.WriteString("\n\n## The user's account (private to this user)\n")
	b.WriteString("Today is " + time.Now().Format("Monday 2 January 2006, 15:04") + ".\n")

	if s.billing != nil {
		if sum, err := s.billing.Summary(userID); err == nil {
			fmt.Fprintf(&b, "Plan: %s.\n", sum.Plan.Name)
			fmt.Fprintf(&b, "SMS: %d credits + %d free today; each SMS part costs UGX %d.\n", sum.SMSBalance, sum.FreeSMSRemaining, sum.SMSPriceUGX)
			fmt.Fprintf(&b, "WhatsApp: %d credits + %d free today; each message costs UGX %d.\n", sum.WhatsAppBalance, sum.FreeWhatsAppRemaining, sum.WhatsAppPriceUGX)
		}
	}

	if s.whatsapp != nil {
		if accounts, err := s.whatsapp.ListAccounts(userID); err == nil {
			online := 0
			for _, a := range accounts {
				if a.Online {
					online++
				}
			}
			fmt.Fprintf(&b, "Linked WhatsApp numbers: %d (%d online). WhatsApp sends need an online number.\n", len(accounts), online)
		}
	}

	if s.contacts != nil {
		groupNames := map[uint]string{}
		if groups, err := s.contacts.ListGroups(userID); err == nil && len(groups) > 0 {
			b.WriteString("\n### Contact groups\n")
			for _, g := range groups {
				groupNames[g.ID] = g.Name
				fmt.Fprintf(&b, "- %s (%d contacts)\n", g.Name, g.ContactCount)
			}
		}
		if list, err := s.contacts.ListContacts(userID, "", 0, aiChatContextContacts, 0); err == nil {
			fmt.Fprintf(&b, "\n### Contacts (%d total", list.Total)
			if list.Total > int64(len(list.Contacts)) {
				fmt.Fprintf(&b, "; showing %d. Others can still be reached by group", len(list.Contacts))
			}
			b.WriteString(")\n")
			for _, c := range list.Contacts {
				fmt.Fprintf(&b, "- %s: %s", strings.TrimSpace(c.Name), c.Phone)
				var names []string
				for _, id := range c.GroupIDs {
					if n := groupNames[id]; n != "" {
						names = append(names, n)
					}
				}
				if len(names) > 0 {
					b.WriteString(" [" + strings.Join(names, ", ") + "]")
				}
				b.WriteString("\n")
			}
		}
	}

	if s.sms != nil {
		if msgs, err := s.sms.ListUserMessages(userID, aiChatContextHistory); err == nil && len(msgs) > 0 {
			b.WriteString("\n### Recent SMS (newest first)\n")
			for _, m := range msgs {
				fmt.Fprintf(&b, "- %s to %s, %s: %q\n", m.CreatedAt.Format("2 Jan 15:04"), m.Phone, m.Status, truncateRunes(m.Message, 90))
			}
		}
	}
	if s.whatsapp != nil {
		if msgs, err := s.whatsapp.ListMessages(userID, aiChatContextHistory); err == nil && len(msgs) > 0 {
			b.WriteString("\n### Recent WhatsApp messages (newest first)\n")
			for _, m := range msgs {
				fmt.Fprintf(&b, "- %s to %s, %s: %q\n", m.CreatedAt.Format("2 Jan 15:04"), m.Recipient, m.Status, truncateRunes(m.Body, 90))
			}
		}
	}
	return b.String()
}

func truncateRunes(s string, max int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > max {
		return string(r[:max]) + "…"
	}
	return s
}

// clipRunes shortens s to max characters, keeping its line breaks.
func clipRunes(s string, max int) string {
	if r := []rune(s); len(r) > max {
		return string(r[:max]) + "\n…(truncated)"
	}
	return s
}

// userTurnContent inlines attachments into the user's message.
func userTurnContent(turn AIChatMessage) string {
	var b strings.Builder
	b.WriteString(clipRunes(strings.TrimSpace(turn.Content), aiChatMaxTurnLength))
	for _, a := range turn.Attachments {
		fmt.Fprintf(&b, "\n\n[Attached %s: %q", a.Kind, a.Name)
		if a.Kind == "spreadsheet" {
			fmt.Fprintf(&b, ", %d rows, columns: %s", a.Rows, strings.Join(a.Columns, ", "))
		}
		b.WriteString("]\n")
		b.WriteString(clipRunes(a.Text, aiChatMaxAttachmentText))
	}
	return b.String()
}

// Chat continues a conversation with the assistant and validates the actions it proposes.
func (s *AIChatService) Chat(userID uint, req *AIChatRequest) (*AIChatResponse, error) {
	if s.ai.cfg.NVIDIAAPIKey == "" {
		log.Printf("AI: chat requested but NVIDIA_API_KEY is missing")
		return nil, ErrAIUnavailable
	}
	turns := req.Messages
	if len(turns) == 0 || turns[len(turns)-1].Role != "user" {
		return nil, errors.New("type a message first")
	}
	last := turns[len(turns)-1]
	if strings.TrimSpace(last.Content) == "" && len(last.Attachments) == 0 {
		return nil, errors.New("type a message first")
	}
	if len([]rune(last.Content)) > aiChatMaxTurnLength {
		return nil, errors.New("your message is too long; keep it under 4000 characters")
	}
	if len(turns) > aiChatMaxTurns {
		turns = turns[len(turns)-aiChatMaxTurns:]
	}

	system := aiChatInstructions
	if req.Images {
		system += aiChatImagesOnInstructions
	} else {
		system += aiChatImagesOffInstructions
	}
	if req.Think {
		system += aiChatThinkingInstructions
	}
	system += s.accountContext(userID)

	messages := []map[string]string{{"role": "system", "content": system}}
	for i, turn := range turns {
		switch turn.Role {
		case "user":
			content := userTurnContent(turn)
			if i == len(turns)-1 {
				setting := "OFF"
				if req.Images {
					setting = "ON"
				}
				content += "\n\n[App settings now: Image is " + setting + ". This overrides anything said earlier in the chat.]"
			}
			messages = append(messages, map[string]string{"role": "user", "content": content})
		case "assistant":
			// Replay earlier answers in the JSON shape the model is asked to use, so it keeps that format
			// and can revise actions it proposed before.
			actions := turn.Actions
			if actions == nil {
				actions = []AIChatAction{}
			}
			encoded, _ := json.Marshal(AIChatResponse{Reply: clipRunes(strings.TrimSpace(turn.Content), aiChatMaxTurnLength), Actions: actions})
			messages = append(messages, map[string]string{"role": "assistant", "content": string(encoded)})
		}
	}

	opts := aiCallOptions{MaxTokens: 3000, Thinking: req.Think, Preferred: strings.TrimSpace(req.Model), Validate: func(body []byte) error {
		content, err := completionContent(body)
		if err == nil {
			_, err = parseAIChat(content)
		}
		return err
	}}
	if req.Think {
		opts.MaxTokens = 8000
	}
	respBody, err := s.ai.completeWithFallback(messages, opts)
	if err != nil {
		return nil, err
	}
	var completion struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content          string `json:"content"`
				ReasoningContent string `json:"reasoning_content"`
				Reasoning        string `json:"reasoning"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &completion); err != nil || len(completion.Choices) == 0 {
		return nil, errors.New("AI service returned an unexpected response")
	}
	msg := completion.Choices[0].Message
	out, err := parseAIChat(msg.Content)
	if err != nil {
		return nil, err
	}
	out.Model = completion.Model
	// Prefer the model's native reasoning over the summary it wrote into the JSON.
	if native := strings.TrimSpace(msg.ReasoningContent + msg.Reasoning); native != "" {
		out.Thinking = native
	}
	if !req.Think {
		out.Thinking = ""
	}
	if req.Images {
		context := last.Content
		if len(turns) > 1 && turns[len(turns)-2].Role == "assistant" {
			context = "Assistant: " + clipRunes(turns[len(turns)-2].Content, 600) + "\nUser: " + last.Content
		}
		s.ensureImage(out, last.Content, context)
		fixImageOffClaim(out)
		if s.billing != nil && !s.billing.HasPaidFeatures(userID) {
			for i := range out.Actions {
				if out.Actions[i].Type == "generate_image" {
					out.Actions[i].Source = "stock"
				}
			}
		}
	} else {
		out.Actions = withoutImages(out.Actions)
	}
	return out, nil
}

var (
	// aiImageIntent spots requests for a picture, e.g. "design a flyer", "make an image of…".
	aiImageIntent   = regexp.MustCompile(`(?i)\b(image|images|picture|photo|flyer|poster|banner|logo|artwork|illustration|graphic|drawing|draw|thumbnail|status (image|picture))\b`)
	aiImageOffClaim = regexp.MustCompile(`(?i)(image[^.]{0,20}\b(is|are)\s+(currently\s+)?(turned\s+|switched\s+)?off|turn(ed)?\s+on[^.]{0,10}["“']?image|switch\s+on[^.]{0,10}["“']?image)`)
	aiImageExplicit = regexp.MustCompile(`(?i)(\bai\b|\ba\.i\.?|ai-generated|\bgenerat\w*\s+(it\s+)?with\s+ai|\bdraw\w*|\billustrat\w*|\bcartoon|\blogo|\brender\w*|\bcustom (design|artwork|image))`)
	// aiImageRefusal spots models claiming they can't make images despite being told they can.
	aiImageRefusal = regexp.MustCompile(`(?i)(can(no|'|’)?t|unable to|not able to|don['’]?t have|do not have|no (ability|capability))[^.]{0,60}(image|design|generat|draw|flyer|picture|visual|graphic)`)
)

func withoutImages(actions []AIChatAction) []AIChatAction {
	out := actions[:0]
	for _, a := range actions {
		if a.Type != "generate_image" {
			out = append(out, a)
		}
	}
	return out
}

// ensureImage adds an image when the user clearly asked for one but the model didn't propose it
// (smaller models sometimes insist they can't draw), and drops any such refusal from the reply.
func (s *AIChatService) ensureImage(out *AIChatResponse, request, context string) {
	for _, a := range out.Actions {
		if a.Type == "generate_image" {
			return
		}
	}
	if !aiImageIntent.MatchString(request) {
		return
	}
	query, prompt, err := s.imagePrompt(context)
	if err != nil || len(prompt) < 3 {
		prompt = "Professional, vibrant marketing image for a small business in Uganda: " + clipRunes(strings.TrimSpace(request), 500)
	}
	if len(query) < 2 {
		query = stockQuery(prompt)
	}
	aspect := "square"
	if regexp.MustCompile(`(?i)flyer|poster|status|story`).MatchString(request) {
		aspect = "portrait"
	} else if regexp.MustCompile(`(?i)banner|cover|header`).MatchString(request) {
		aspect = "landscape"
	}
	source := "stock"
	if aiImageExplicit.MatchString(request) {
		source = "ai"
	}
	out.Actions = append([]AIChatAction{{Type: "generate_image", Source: source, Query: clipRunes(query, 100), Prompt: clipRunes(prompt, 2000), Aspect: aspect}}, out.Actions...)
	if len(out.Actions) > aiChatMaxActions {
		out.Actions = out.Actions[:aiChatMaxActions]
	}
	if aiImageRefusal.MatchString(out.Reply) || aiImageOffClaim.MatchString(out.Reply) {
		out.Reply = imageReadyReply
	}
}

const imageReadyReply = "Here's an image for you below. You can pick another photo or generate one with AI. Want me to write an SMS or WhatsApp message to go with it?"

// fixImageOffClaim removes a claim that images are off when they are on (models copy it from earlier turns).
func fixImageOffClaim(out *AIChatResponse) {
	if !aiImageOffClaim.MatchString(out.Reply) {
		return
	}
	for _, a := range out.Actions {
		if a.Type == "generate_image" {
			out.Reply = imageReadyReply
			return
		}
	}
	out.Reply = "Images are on. Tell me what the picture should show, or I can suggest one to go with your message."
}

// imagePrompt asks the chat model for just an image description.
func (s *AIChatService) imagePrompt(context string) (query, prompt string, err error) {
	messages := []map[string]string{
		{"role": "system", "content": `You pick images for a business messaging app. From the conversation, reply with ONLY JSON: {"query": "<2-5 English keywords for a stock photo search naming what is visible, e.g. children classroom Africa>", "prompt": "<one paragraph describing subject, setting, style, colours, lighting and composition for an AI image, no text in the image>"}`},
		{"role": "user", "content": clipRunes(strings.TrimSpace(context), 1500)},
	}
	body, err := s.ai.completeWithFallback(messages, aiCallOptions{MaxTokens: 400, Validate: func(body []byte) error {
		content, err := completionContent(body)
		if err == nil && !strings.Contains(content, "{") {
			err = errors.New("no JSON")
		}
		return err
	}})
	if err != nil {
		return "", "", err
	}
	content, err := completionContent(body)
	if err != nil {
		return "", "", err
	}
	var out struct {
		Query  string `json:"query"`
		Prompt string `json:"prompt"`
	}
	start, end := strings.Index(content, "{"), strings.LastIndex(content, "}")
	if start < 0 || end <= start || json.Unmarshal([]byte(content[start:end+1]), &out) != nil {
		return "", "", errors.New("invalid image JSON")
	}
	return strings.TrimSpace(out.Query), strings.TrimSpace(out.Prompt), nil
}

// parseAIChat reads the model's JSON answer. A model that answers in plain text still gets its text shown.
func parseAIChat(raw string) (*AIChatResponse, error) {
	raw = strings.TrimSpace(raw)
	// Some reasoning models put their thinking inline before the answer.
	if i := strings.Index(raw, "</think>"); i >= 0 {
		raw = strings.TrimSpace(raw[i+len("</think>"):])
	}
	out := findChatJSON(raw)
	if out == nil {
		out = &AIChatResponse{Reply: raw}
		if reply, ok := extractReplyField(raw); ok {
			out.Reply = reply
		}
	}
	for i := 0; i < 2; i++ {
		inner := strings.TrimSpace(out.Reply)
		if !strings.HasPrefix(inner, "{") || !strings.Contains(inner, `"reply"`) {
			break
		}
		nested := findChatJSON(inner)
		if nested == nil {
			if reply, ok := extractReplyField(inner); ok {
				out.Reply = reply
			}
			break
		}
		out.Reply = nested.Reply
		if len(out.Plan) == 0 {
			out.Plan = nested.Plan
		}
		if len(out.Actions) == 0 {
			out.Actions = nested.Actions
		}
		if out.Thinking == "" {
			out.Thinking = nested.Thinking
		}
	}
	out.Reply = strings.TrimSpace(out.Reply)
	out.Thinking = strings.TrimSpace(out.Thinking)

	plan := make([]string, 0, len(out.Plan))
	for _, step := range out.Plan {
		if step = strings.TrimSpace(step); step != "" && len(plan) < 10 {
			plan = append(plan, step)
		}
	}
	out.Plan = plan

	actions := make([]AIChatAction, 0, len(out.Actions))
	for _, action := range out.Actions {
		if cleaned, ok := cleanAIChatAction(action); ok && len(actions) < aiChatMaxActions {
			actions = append(actions, cleaned)
		}
	}
	out.Actions = actions

	if out.Reply == "" && len(actions) == 0 {
		return nil, errors.New("AI returned an empty answer; try again")
	}
	if out.Reply == "" {
		out.Reply = "Here's what I prepared. Review it below before confirming."
	}
	return out, nil
}

func cleanList(values []string, max int) []string {
	out := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v != "" && !seen[strings.ToLower(v)] && len(out) < max {
			seen[strings.ToLower(v)] = true
			out = append(out, v)
		}
	}
	return out
}

// cleanAIChatAction drops unknown or incomplete actions and normalises the rest.
func cleanAIChatAction(action AIChatAction) (AIChatAction, bool) {
	action.Type = strings.ToLower(strings.TrimSpace(action.Type))
	message := strings.TrimSpace(action.Message)
	switch action.Type {
	case "send_sms", "send_whatsapp":
		if message == "" {
			return action, false
		}
		out := AIChatAction{
			Type:       action.Type,
			Recipients: cleanList(action.Recipients, aiChatMaxRecipients),
			Groups:     cleanList(action.Groups, 20),
			Message:    message,
		}
		if action.Type == "send_whatsapp" {
			withWhatsAppExtras(&out, action)
		}
		return out, true
	case "send_personalized":
		items := make([]AIChatRecipientMessage, 0, len(action.Items))
		for _, item := range action.Items {
			item.To, item.Message = strings.TrimSpace(item.To), strings.TrimSpace(item.Message)
			if item.To != "" && item.Message != "" && len(items) < aiChatMaxItems {
				items = append(items, item)
			}
		}
		if len(items) == 0 {
			return action, false
		}
		out := AIChatAction{Type: action.Type, Channel: normalizeTemplateChannel(action.Channel), Items: items}
		if out.Channel == "whatsapp" {
			withWhatsAppExtras(&out, action)
		}
		return out, true
	case "send_from_file":
		if message == "" || strings.TrimSpace(action.Attachment) == "" {
			return action, false
		}
		out := AIChatAction{
			Type:        action.Type,
			Channel:     normalizeTemplateChannel(action.Channel),
			Attachment:  strings.TrimSpace(action.Attachment),
			PhoneColumn: strings.TrimSpace(action.PhoneColumn),
			Message:     message,
		}
		if out.Channel == "whatsapp" {
			withWhatsAppExtras(&out, action)
		}
		return out, true
	case "generate_image":
		prompt := strings.TrimSpace(action.Prompt)
		if prompt == "" {
			prompt = message
		}
		query := strings.TrimSpace(action.Query)
		if prompt == "" {
			prompt = query
		}
		if len(prompt) < 3 {
			return action, false
		}
		if query == "" {
			query = stockQuery(prompt)
		}
		source := "stock"
		if strings.EqualFold(strings.TrimSpace(action.Source), "ai") {
			source = "ai"
		}
		return AIChatAction{Type: action.Type, Source: source, Query: clipRunes(query, 100), Prompt: clipRunes(prompt, 2000), Aspect: normalizeImageAspect(action.Aspect)}, true
	case "create_template":
		content := strings.TrimSpace(action.Content)
		if content == "" {
			content = message
		}
		if content == "" {
			return action, false
		}
		encoded, _ := json.Marshal(map[string]string{"name": action.Name, "category": action.Category, "content": content})
		tpl, err := parseAITemplate(string(encoded), normalizeTemplateChannel(action.Channel), "")
		if err != nil {
			return action, false
		}
		out := AIChatAction{Type: action.Type, Name: tpl.Name, Category: tpl.Category, Channel: tpl.Channel, Content: tpl.Content}
		if out.Channel == "whatsapp" {
			withWhatsAppExtras(&out, action)
		}
		return out, true
	}
	return action, false
}

// completionContent extracts the answer text from an OpenAI-style completion.
func completionContent(body []byte) (string, error) {
	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &completion); err != nil || len(completion.Choices) == 0 {
		return "", errors.New("unexpected response shape")
	}
	content := strings.TrimSpace(completion.Choices[0].Message.Content)
	if content == "" {
		return "", errors.New("empty answer")
	}
	return content, nil
}

// findChatJSON finds the answer object in the model output. Some models write reasoning or prose
// around it (possibly with braces of its own), so it tries each "{" and keeps the last object that
// decodes with a reply or actions, which is the final answer.
func findChatJSON(raw string) *AIChatResponse {
	var found *AIChatResponse
	for i := 0; i < len(raw); i++ {
		if raw[i] != '{' {
			continue
		}
		var candidate AIChatResponse
		dec := json.NewDecoder(strings.NewReader(raw[i:]))
		if dec.Decode(&candidate) != nil {
			continue
		}
		if strings.TrimSpace(candidate.Reply) != "" || len(candidate.Actions) > 0 {
			c := candidate
			found = &c
			// Skip past this object so its nested braces aren't decoded again.
			i += int(dec.InputOffset()) - 1
		}
	}
	return found
}

// Models lists the chat models the user can pick, with their current health.
func (s *AIChatService) Models() []AIModelInfo { return s.ai.Models() }

var stockStopWords = map[string]bool{
	"a": true, "an": true, "the": true, "of": true, "for": true, "to": true, "on": true, "in": true, "with": true, "and": true,
	"our": true, "my": true, "me": true, "us": true, "please": true, "can": true, "you": true, "i": true, "we": true, "some": true,
	"make": true, "create": true, "design": true, "generate": true, "find": true, "get": true, "give": true, "show": true, "need": true, "want": true,
	"image": true, "images": true, "picture": true, "pictures": true, "photo": true, "photos": true, "flyer": true, "poster": true,
	"banner": true, "graphic": true, "artwork": true, "status": true, "whatsapp": true, "sms": true, "that": true, "this": true, "is": true,
}

// stockQuery turns a request or prompt into a few photo search keywords.
func stockQuery(text string) string {
	var words []string
	for _, w := range strings.Fields(strings.ToLower(text)) {
		w = strings.Trim(w, ".,!?:;\"'()[]{}")
		if len(w) > 1 && !stockStopWords[w] {
			words = append(words, w)
		}
		if len(words) == 5 {
			break
		}
	}
	return strings.Join(words, " ")
}

// extractReplyField recovers the "reply" string from JSON that is otherwise broken or truncated.
func extractReplyField(raw string) (string, bool) {
	i := strings.Index(raw, `"reply"`)
	if i < 0 {
		return "", false
	}
	rest := strings.TrimLeft(raw[i+len(`"reply"`):], " \t\r\n")
	if !strings.HasPrefix(rest, ":") {
		return "", false
	}
	rest = strings.TrimLeft(rest[1:], " \t\r\n")
	var reply string
	if json.NewDecoder(strings.NewReader(rest)).Decode(&reply) != nil || strings.TrimSpace(reply) == "" {
		return "", false
	}
	return reply, true
}

// withWhatsAppExtras copies valid header, footer, buttons and banner keywords; invalid buttons are dropped.
func withWhatsAppExtras(out *AIChatAction, in AIChatAction) {
	rich, err := normalizeWhatsAppRich(models.WhatsAppRich{Header: firstRunes(in.Header, 60), Footer: firstRunes(in.Footer, 60), Buttons: in.Buttons})
	if err != nil {
		rich, _ = normalizeWhatsAppRich(models.WhatsAppRich{Header: firstRunes(in.Header, 60), Footer: firstRunes(in.Footer, 60)})
	}
	out.Header, out.Footer, out.Buttons = rich.Header, rich.Footer, rich.Buttons
	out.ImageQuery = clipRunes(strings.TrimSpace(in.ImageQuery), 100)
}

func firstRunes(s string, n int) string {
	if r := []rune(strings.TrimSpace(s)); len(r) > n {
		return strings.TrimSpace(string(r[:n]))
	}
	return strings.TrimSpace(s)
}
