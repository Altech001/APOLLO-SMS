package services

import (
	"errors"
	"sort"
	"strings"
	"sync"
	"time"
)

// Friendly errors shown to users; the technical cause is logged instead.
var (
	ErrAIBusy        = errors.New("Apollo is very busy right now. Please try again in a moment.")
	ErrAIUnavailable = errors.New("Apollo is temporarily unavailable. Please try again later.")
)

// AIModelInfo describes a model the user can pick in the app.
type AIModelInfo struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
	Reasoning   bool   `json:"reasoning"`
	// available, busy (cooling down after errors) or unavailable (retired or not enabled for this key)
	Status string `json:"status"`
}

// aiModelCatalog labels known models; unknown ids from NVIDIA_MODEL still work with a generic label.
var aiModelCatalog = map[string]AIModelInfo{
	"nvidia/nemotron-3-super-120b-a12b":     {Label: "Nemotron 3 Super", Description: "Balanced quality and speed", Reasoning: true},
	"nvidia/nemotron-3-ultra-550b-a55b":     {Label: "Nemotron 3 Ultra", Description: "Most capable, best for planning and files", Reasoning: true},
	"nvidia/nemotron-3.5-lightning-30b-a3b": {Label: "Nemotron 3.5 Lightning", Description: "Fastest replies", Reasoning: true},
	"deepseek-ai/deepseek-v4.1-flash":       {Label: "DeepSeek V4.1 Flash", Description: "Strong writing and reasoning", Reasoning: true},
	"moonshotai/kimi-k3":                    {Label: "Kimi K3", Description: "Long documents and spreadsheets", Reasoning: true},
	"z-ai/glm-5.3-flash":                    {Label: "GLM 5.3 Flash", Description: "Quick multilingual answers", Reasoning: true},
	"openai/gpt-oss-20b":                    {Label: "GPT-OSS 20B", Description: "Open model, slower", Reasoning: true},
}

func modelInfo(id string) AIModelInfo {
	info, ok := aiModelCatalog[id]
	if !ok {
		name := id[strings.LastIndex(id, "/")+1:]
		info = AIModelInfo{Label: name, Description: "Custom model"}
	}
	info.ID = id
	return info
}

func splitModels(list string) []string {
	var out []string
	seen := map[string]bool{}
	for _, m := range strings.Split(list, ",") {
		if m = strings.TrimSpace(m); m != "" && !seen[m] {
			seen[m] = true
			out = append(out, m)
		}
	}
	return out
}

// modelHealth remembers which models failed recently so requests go to healthy ones first.
// Busy models (overloaded, timing out, rate limited) cool down briefly, longer after repeat failures;
// retired or unenabled models (404/410) are skipped for hours. Any success clears a model's record.
type modelHealth struct {
	mu     sync.Mutex
	states map[string]*modelState
}

type modelState struct {
	until    time.Time
	failures int
	retired  bool
}

const (
	modelRetiredFor  = 6 * time.Hour
	modelBaseCooloff = 30 * time.Second
	modelMaxCooloff  = 10 * time.Minute
)

func newModelHealth() *modelHealth { return &modelHealth{states: map[string]*modelState{}} }

func (h *modelHealth) succeeded(model string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.states, model)
}

func (h *modelHealth) busy(model string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	st := h.states[model]
	if st == nil {
		st = &modelState{}
		h.states[model] = st
	}
	st.failures++
	cooloff := modelBaseCooloff << min(st.failures-1, 5)
	st.until = time.Now().Add(min(cooloff, modelMaxCooloff))
}

func (h *modelHealth) retire(model string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.states[model] = &modelState{retired: true, until: time.Now().Add(modelRetiredFor)}
}

// status reports available, busy or unavailable.
func (h *modelHealth) status(model string) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	st := h.states[model]
	switch {
	case st == nil || time.Now().After(st.until):
		return "available"
	case st.retired:
		return "unavailable"
	default:
		return "busy"
	}
}

// order puts the preferred model first, then healthy models in configured order, then busy ones
// (soonest to recover first) as a last resort. Retired models are dropped unless nothing else is left.
func (h *modelHealth) order(models []string, preferred string) []string {
	if preferred != "" {
		for i, m := range models {
			if m == preferred {
				models = append([]string{m}, append(append([]string{}, models[:i]...), models[i+1:]...)...)
				break
			}
		}
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	now := time.Now()
	var healthy, cooling, retired []string
	for _, m := range models {
		st := h.states[m]
		switch {
		case st == nil || now.After(st.until):
			healthy = append(healthy, m)
		case st.retired:
			retired = append(retired, m)
		default:
			cooling = append(cooling, m)
		}
	}
	sort.SliceStable(cooling, func(i, j int) bool { return h.states[cooling[i]].until.Before(h.states[cooling[j]].until) })
	out := append(healthy, cooling...)
	if len(out) == 0 {
		out = retired
	}
	return out
}
