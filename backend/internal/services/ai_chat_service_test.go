package services

import "testing"

func TestParseAIChat(t *testing.T) {
	raw := "```json\n{\"reply\": \"Here you go\", \"actions\": [" +
		"{\"type\": \"send_sms\", \"recipients\": [\"0772123456\", \" 0772123456 \", \"John\"], \"message\": \"Hi\"}," +
		"{\"type\": \"send_whatsapp\", \"recipients\": [\"John\"], \"message\": \"\"}," +
		"{\"type\": \"create_template\", \"name\": \"Reminder\", \"category\": \"alert\", \"channel\": \"whatsapp\", \"content\": \"Hi {name}\"}," +
		"{\"type\": \"delete_everything\"}]}\n```"
	out, err := parseAIChat(raw)
	if err != nil {
		t.Fatal(err)
	}
	if out.Reply != "Here you go" || len(out.Actions) != 2 {
		t.Fatalf("unexpected result: %+v", out)
	}
	if got := out.Actions[0].Recipients; len(got) != 2 {
		t.Fatalf("recipients not de-duplicated: %v", got)
	}
	if tpl := out.Actions[1]; tpl.Category != "Alert" || tpl.Channel != "whatsapp" {
		t.Fatalf("template not normalised: %+v", tpl)
	}

	plain, err := parseAIChat("Sure, which number should I send it to?")
	if err != nil || plain.Reply != "Sure, which number should I send it to?" || len(plain.Actions) != 0 {
		t.Fatalf("plain text answer not kept: %+v %v", plain, err)
	}
}

func TestParseAIChatBatchActions(t *testing.T) {
	raw := `<think>check the file</think>{"reply": "Ready", "thinking": "rows look fine", "plan": ["Check columns", " ", "Send"], "actions": [
		{"type": "send_from_file", "channel": "WhatsApp", "attachment": "debtors.xlsx", "phone_column": "Phone", "message": "Hi {Name}, you owe UGX {Amount}"},
		{"type": "send_from_file", "attachment": "", "message": "missing file"},
		{"type": "send_personalized", "channel": "sms", "items": [{"to": "0772123456", "message": "Hi A"}, {"to": "", "message": "x"}]},
		{"type": "send_sms", "groups": ["VIP", "vip"], "message": "Sale!"}]}`
	out, err := parseAIChat(raw)
	if err != nil {
		t.Fatal(err)
	}
	if out.Thinking != "rows look fine" || len(out.Plan) != 2 {
		t.Fatalf("thinking/plan not parsed: %+v", out)
	}
	if len(out.Actions) != 3 {
		t.Fatalf("expected 3 valid actions, got %+v", out.Actions)
	}
	if a := out.Actions[0]; a.Channel != "whatsapp" || a.PhoneColumn != "Phone" {
		t.Fatalf("file action not normalised: %+v", a)
	}
	if a := out.Actions[1]; len(a.Items) != 1 {
		t.Fatalf("empty personalised items not dropped: %+v", a)
	}
	if a := out.Actions[2]; len(a.Groups) != 1 {
		t.Fatalf("duplicate groups not removed: %+v", a)
	}
}

func TestParseAIChatImageAction(t *testing.T) {
	out, err := parseAIChat(`{"reply": "Here are two options", "actions": [
		{"type": "generate_image", "prompt": "A bright flyer of fresh mangoes on a market stall", "aspect": "flyer"},
		{"type": "generate_image", "prompt": ""}]}`)
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Actions) != 1 || out.Actions[0].Aspect != "portrait" {
		t.Fatalf("image action not normalised: %+v", out.Actions)
	}
}

func TestImageIntentAndRefusal(t *testing.T) {
	if !aiImageIntent.MatchString("Design a flyer image for our weekend sale on fresh juice") {
		t.Fatal("flyer request not detected")
	}
	if aiImageIntent.MatchString("Send an SMS to 0772123456 saying we open at 9") {
		t.Fatal("plain SMS request detected as image")
	}
	refusal := "I can help you create a message, but I don’t have the capability to design or generate flyer images."
	if !aiImageRefusal.MatchString(refusal) {
		t.Fatal("refusal not detected")
	}
}

func TestFindChatJSONWithSurroundingText(t *testing.T) {
	raw := "Here's a thinking process: consider {placeholders} like {name}.\n\n{\"reply\": \"Final answer\", \"actions\": []}"
	out, err := parseAIChat(raw)
	if err != nil || out.Reply != "Final answer" {
		t.Fatalf("answer object not found: %+v %v", out, err)
	}
}

func TestModelHealthOrder(t *testing.T) {
	h := newModelHealth()
	models := []string{"a", "b", "c", "d"}
	h.retire("a")
	h.busy("b")
	if got := h.order(models, ""); len(got) != 3 || got[0] != "c" || got[1] != "d" || got[2] != "b" {
		t.Fatalf("healthy first, busy last, retired dropped: got %v", got)
	}
	if got := h.order(models, "d"); got[0] != "d" {
		t.Fatalf("preferred model not first: %v", got)
	}
	h.succeeded("b")
	if h.status("b") != "available" || h.status("a") != "unavailable" {
		t.Fatalf("unexpected statuses: b=%s a=%s", h.status("b"), h.status("a"))
	}
	h.retire("b")
	h.retire("c")
	h.retire("d")
	if got := h.order(models, ""); len(got) != 4 {
		t.Fatalf("all retired should still try every model, got %v", got)
	}
}

func TestImageSourceAndQuery(t *testing.T) {
	out, err := parseAIChat(`{"reply": "ok", "actions": [
		{"type": "generate_image", "prompt": "Glasses of orange and mango juice on a market table"},
		{"type": "generate_image", "source": "AI", "query": "juice logo", "prompt": "Minimal juice bar logo"}]}`)
	if err != nil {
		t.Fatal(err)
	}
	if a := out.Actions[0]; a.Source != "stock" || a.Query == "" {
		t.Fatalf("default should be stock with a query: %+v", a)
	}
	if a := out.Actions[1]; a.Source != "ai" || a.Query != "juice logo" {
		t.Fatalf("explicit ai source not kept: %+v", a)
	}
	if got := stockQuery("Design a flyer image for our weekend sale on fresh juice"); got != "weekend sale fresh juice" {
		t.Fatalf("stockQuery = %q", got)
	}
	if !aiImageExplicit.MatchString("make me an AI image of a juice bar") || aiImageExplicit.MatchString("find a photo of fresh juice") {
		t.Fatal("explicit AI detection wrong")
	}
}

func TestFixImageOffClaim(t *testing.T) {
	claim := `Image generation is currently turned off. To search for or generate images, please switch on the "Image" option in the message box.`
	out := &AIChatResponse{Reply: claim, Actions: []AIChatAction{{Type: "generate_image"}}}
	fixImageOffClaim(out)
	if out.Reply != imageReadyReply {
		t.Fatalf("off claim not replaced: %q", out.Reply)
	}
	fine := &AIChatResponse{Reply: "Here is a WhatsApp message for the parents."}
	fixImageOffClaim(fine)
	if fine.Reply != "Here is a WhatsApp message for the parents." {
		t.Fatal("normal reply changed")
	}
}

func TestParseAIChatNestedAndBroken(t *testing.T) {
	nested := `{"reply": "{\"reply\":\"Inner answer\",\"plan\":[\"Step\"],\"actions\":[{\"type\":\"generate_image\",\"prompt\":\"kids in a classroom\"}]}"}`
	out, err := parseAIChat(nested)
	if err != nil || out.Reply != "Inner answer" || len(out.Plan) != 1 {
		t.Fatalf("nested reply not unwrapped: %+v %v", out, err)
	}
	broken := `{"reply": "Recovered text", "actions": [{"type": "send_sms", "message": "Hi"`
	out, err = parseAIChat(broken)
	if err != nil || out.Reply != "Recovered text" {
		t.Fatalf("reply not recovered from broken JSON: %+v %v", out, err)
	}
}
