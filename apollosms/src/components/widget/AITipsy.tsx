/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { base44 } from "@/api/apollosms";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    Reasoning,
    ReasoningContent,
    ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
    BarChart3,
    BookOpen,
    Brain,
    Check,
    CheckCircle2,
    ChevronDown,
    Code2,
    Copy,
    Download,
    FileText,
    GitBranch,
    Maximize2,
    Mic,
    Minimize2,
    Navigation,
    Pencil,
    RefreshCw,
    RotateCcw,
    Search,
    Send,
    Terminal,
    ThumbsDown,
    ThumbsUp,
    Volume2,
    VolumeX,
    Wand2,
    Wrench,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

type WidgetMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    artifacts?: WidgetArtifact[];
    isStreaming?: boolean;
};

type WidgetArtifact = {
    type: "mermaid" | "code" | "questions" | "sections" | "chart";
    title: string;
    language?: string;
    data: any;
};

type ExpertKey = "router" | "form_search" | "file_search" | "survey_architect" | "flow_designer" | "response_analyst" | "navigator";

type ExpertBrief = {
    key: ExpertKey;
    name: string;
    role: string;
    confidence: number;
    findings: string[];
    handoff: string;
};

const HELP_ACTIONS = [
    { label: "Find forms", prompt: "Search through all my forms and show me the most important ones to review.", icon: Search },
    { label: "Analyze forms", prompt: "Analyze my forms and tell me patterns, risks, missing fields, and next actions.", icon: BarChart3 },
    { label: "Teach me", prompt: "Teach me how to use ForeForm step by step with clickable places to go.", icon: BookOpen },
    { label: "Fix grammar", prompt: "Correct the grammar and wording of this text: ", icon: Wand2 },
];

const ROUTE_GUIDES = [
    { label: "Dashboard", path: "/" },
    { label: "AI Builder", path: "/complex-ai" },
    { label: "Agent", path: "/agent" },
    { label: "AI Respondents", path: "/ai-respondents" },
    { label: "Profile", path: "/profile" },
];

type CommandType = "action" | "prefix" | "navigate";
const COMMANDS: { name: string; label: string; description: string; prompt?: string; path?: string; icon: React.ElementType; type: CommandType }[] = [
    { name: "analysis", label: "Analyze forms", description: "Patterns, risks & missing fields", prompt: "Analyze my forms and tell me patterns, risks, missing fields, and next actions.", icon: BarChart3, type: "action" },
    { name: "find", label: "Find forms", description: "Search through your workspace forms", prompt: "Search through all my forms and show me the most important ones to review.", icon: Search, type: "action" },
    { name: "teach", label: "Teach me", description: "Step-by-step guide to ForeForm", prompt: "Teach me how to use ForeForm step by step with clickable places to go.", icon: BookOpen, type: "action" },
    { name: "grammar", label: "Fix grammar", description: "Correct the grammar of text you type", prompt: "Correct the grammar and wording of this text: ", icon: Wand2, type: "prefix" },
    { name: "dashboard", label: "Dashboard", description: "Go to the main Dashboard", path: "/", icon: Navigation, type: "navigate" },
    { name: "builder", label: "AI Builder", description: "Open the AI form builder", path: "/complex-ai", icon: GitBranch, type: "navigate" },
    { name: "agent", label: "Agent", description: "Go to the AI Agent page", path: "/agent", icon: RefreshCw, type: "navigate" },
    { name: "respondents", label: "AI Respondents", description: "View AI form respondents", path: "/ai-respondents", icon: BarChart3, type: "navigate" },
    { name: "profile", label: "Profile", description: "Open your profile page", path: "/profile", icon: FileText, type: "navigate" },
];

const uid = () => Math.random().toString(36).slice(2, 10);

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function tokenizeForStreaming(text: string) {
    return text.match(/\S+\s*/g) || [];
}

const INTENT_TERMS = {
    search: ["find", "search", "look", "show", "which", "where", "file", "form"],
    analyze: ["analyze", "audit", "risk", "pattern", "missing", "quality", "compare", "responses", "insight"],
    build: ["create", "generate", "draft", "build", "questions", "survey", "form", "template"],
    flow: ["flow", "diagram", "mermaid", "process", "workflow", "map", "architecture"],
    navigate: ["open", "go", "route", "page", "teach", "guide", "step"],
    code: ["code", "react", "component", "design pattern", "api", "implementation"],
};

function stripHtml(value = "") {
    const el = document.createElement("div");
    el.innerHTML = value;
    return el.textContent || el.innerText || "";
}

function findMatchingForms(forms: any[], query: string) {
    const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
    if (terms.length === 0) return forms.slice(0, 6);

    return forms
        .map((form) => {
            const questions = (form.questions || []).map((q: any) => q.label).join(" ");
            const haystack = `${form.title || ""} ${stripHtml(form.description || "")} ${questions}`.toLowerCase();
            const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
            return { form, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.form)
        .slice(0, 8);
}

function findMatchingDocuments(documents: any[], query: string) {
    const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
    return documents
        .map((doc) => {
            const haystack = `${doc.name || ""} ${doc.original_name || ""} ${doc.type || ""} ${doc.description || ""}`.toLowerCase();
            const score = terms.length === 0 ? 1 : terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
            return { doc, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.doc)
        .slice(0, 8);
}

function countIntentHits(query: string, terms: string[]) {
    const normalized = query.toLowerCase();
    return terms.reduce((sum, term) => sum + (normalized.includes(term) ? 1 : 0), 0);
}

function summarizeForm(form: any) {
    const questions = (form.questions || []).slice(0, 12).map((q: any, index: number) => ({
        index: index + 1,
        label: q.label,
        type: q.type,
        required: Boolean(q.required),
    }));

    return {
        id: form.id,
        title: form.title,
        status: form.status,
        responses: form.response_count || 0,
        description: stripHtml(form.description || "").slice(0, 280),
        questions,
    };
}

function buildExpertBriefs(args: {
    prompt: string;
    route: string;
    matchingForms: any[];
    matchingDocuments: any[];
    totalForms: number;
    totalDocuments: number;
}) {
    const { prompt, route, matchingForms, matchingDocuments, totalForms, totalDocuments } = args;
    const intentScores = {
        search: countIntentHits(prompt, INTENT_TERMS.search),
        analyze: countIntentHits(prompt, INTENT_TERMS.analyze),
        build: countIntentHits(prompt, INTENT_TERMS.build),
        flow: countIntentHits(prompt, INTENT_TERMS.flow),
        navigate: countIntentHits(prompt, INTENT_TERMS.navigate),
        code: countIntentHits(prompt, INTENT_TERMS.code),
    };

    const topFormTitles = matchingForms.slice(0, 3).map((form) => form.title || "Untitled form");
    const topDocumentNames = matchingDocuments.slice(0, 3).map((doc) => doc.name || doc.original_name || "Untitled file");

    const briefs: ExpertBrief[] = [
        {
            key: "router",
            name: "Coordinator",
            role: "Selects the most relevant workspace context.",
            confidence: 0.98,
            findings: [
                `Route context: ${route}`,
                `Intent weights: search ${intentScores.search}, analyze ${intentScores.analyze}, build ${intentScores.build}, flow ${intentScores.flow}, navigate ${intentScores.navigate}, code ${intentScores.code}`,
            ],
            handoff: "Synthesize the strongest signals into one direct answer.",
        },
        {
            key: "form_search",
            name: "Form Search Agent",
            role: "Searches titles, descriptions, and question labels.",
            confidence: Math.min(0.95, 0.3 + matchingForms.length * 0.12 + intentScores.search * 0.08),
            findings: [
                `${matchingForms.length} matching form${matchingForms.length === 1 ? "" : "s"} from ${totalForms} total.`,
                topFormTitles.length > 0 ? `Top forms: ${topFormTitles.join(", ")}.` : "No close form matches found.",
            ],
            handoff: "Use exact form titles when citing workspace results.",
        },
        {
            key: "file_search",
            name: "File Search Agent",
            role: "Looks across uploaded document metadata and file names.",
            confidence: Math.min(0.9, 0.25 + matchingDocuments.length * 0.14 + intentScores.search * 0.05),
            findings: [
                `${matchingDocuments.length} matching file${matchingDocuments.length === 1 ? "" : "s"} from ${totalDocuments} total.`,
                topDocumentNames.length > 0 ? `Top files: ${topDocumentNames.join(", ")}.` : "No close file matches found.",
            ],
            handoff: "Mention file names only when they are relevant to the answer.",
        },
        {
            key: "survey_architect",
            name: "Survey Architect",
            role: "Designs form structure, question quality, and JSON form drafts.",
            confidence: Math.min(0.92, 0.28 + intentScores.build * 0.18 + intentScores.analyze * 0.06),
            findings: [
                intentScores.build > 0 ? "User may need a generated or improved form structure." : "No strong form-building intent detected.",
                "Prefer concise question groups, clear required fields, and usable response types.",
            ],
            handoff: "When drafting forms, include JSON artifacts the widget can render.",
        },
        {
            key: "flow_designer",
            name: "Flow Designer",
            role: "Creates Mermaid diagrams and workflow maps.",
            confidence: Math.min(0.94, 0.24 + intentScores.flow * 0.22 + intentScores.code * 0.08),
            findings: [
                intentScores.flow > 0 ? "A visual flow or Mermaid graph is likely useful." : "Diagram only if it clarifies the answer.",
                "Use small flowcharts with clear node labels.",
            ],
            handoff: "Include a mermaid block for process, architecture, or agent orchestration answers.",
        },
        {
            key: "response_analyst",
            name: "Response Analyst",
            role: "Finds quality issues, response patterns, and next actions.",
            confidence: Math.min(0.9, 0.22 + intentScores.analyze * 0.2 + matchingForms.length * 0.04),
            findings: [
                intentScores.analyze > 0 ? "The answer should include risks, missing data, and recommendations." : "Use analysis only if the user asks for evaluation.",
                "Separate observations from suggested next actions.",
            ],
            handoff: "Make recommendations operational and tied to the matching forms.",
        },
        {
            key: "navigator",
            name: "Navigator Agent",
            role: "Maps user requests to ForeForm routes and quick actions.",
            confidence: Math.min(0.85, 0.18 + intentScores.navigate * 0.22),
            findings: [
                `Available guide routes: ${ROUTE_GUIDES.map((routeGuide) => routeGuide.label).join(", ")}.`,
                intentScores.navigate > 0 ? "User may benefit from step-by-step navigation." : "Keep navigation lightweight.",
            ],
            handoff: "Point to the right ForeForm page when it shortens the workflow.",
        },
    ];

    return briefs
        .filter((brief) => brief.key === "router" || brief.confidence >= 0.3)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5);
}

function extractArtifacts(content: string): WidgetArtifact[] {
    const artifacts: WidgetArtifact[] = [];
    const codeBlockRegex = /```(\w+)?\s*([\s\S]*?)```/g;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(content)) !== null) {
        const language = (match[1] || "text").toLowerCase();
        const code = match[2].trim();
        if (!code) continue;

        if (language === "mermaid") {
            artifacts.push({ type: "mermaid", title: "Mermaid Diagram", language, data: code });
        } else if (language === "chart") {
            try {
                const chart = JSON.parse(code);
                artifacts.push({ type: "chart", title: chart.title || "Chart", language, data: chart });
            } catch {
                artifacts.push({ type: "code", title: "CHART Artifact", language, data: code });
            }
        } else if (language !== "json") {
            artifacts.push({ type: "code", title: `${language.toUpperCase()} Artifact`, language, data: code });
        }
    }

    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            if (!Array.isArray(parsed) && parsed?.type && Array.isArray(parsed?.data)) {
                artifacts.push({ type: "chart", title: parsed.title || "Chart", data: parsed });
            } else if (Array.isArray(parsed) && parsed.length > 0) {
                if (parsed[0]?.questions) {
                    artifacts.push({ type: "sections", title: `${parsed.length} Sections`, data: parsed });
                } else if (parsed[0]?.label || parsed[0]?.type) {
                    artifacts.push({ type: "questions", title: `${parsed.length} Questions`, data: parsed });
                }
            }
        } catch {
            // The assistant may include informal JSON-like examples; ignore parse misses.
        }
    }

    return artifacts;
}

function cleanAssistantMarkdown(content: string) {
    return content
        .replace(/```mermaid[\s\S]*?```/g, "")
        .replace(/```json[\s\S]*?```/g, "")
        .replace(/```chart[\s\S]*?```/g, "")
        .replace(/```(?:mermaid|json|chart)[\s\S]*$/g, "")
        .trim();
}

function ChartArtifact({ chart }: { chart: any }) {
    const data = Array.isArray(chart?.data) ? chart.data.slice(0, 8) : [];
    const maxValue = Math.max(...data.map((item: any) => Number(item.value) || 0), 1);

    return (
        <div className="p-4">
            {chart?.summary && <p className="mb-3 text-xs text-muted-foreground">{chart.summary}</p>}
            <div className="space-y-3">
                {data.map((item: any, index: number) => {
                    const value = Number(item.value) || 0;
                    const width = `${Math.max(4, Math.round((value / maxValue) * 100))}%`;
                    return (
                        <div key={`${item.label}-${index}`} className="grid grid-cols-[minmax(90px,1fr)_2fr_auto] items-center gap-3 text-xs">
                            <span className="truncate font-medium">{item.label || `Item ${index + 1}`}</span>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-primary" style={{ width }} />
                            </div>
                            <span className="font-semibold tabular-nums">{value}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function MermaidFlow({ chart }: { chart: string }) {
    const edges = chart
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.includes("-->"))
        .slice(0, 8)
        .map((line) => {
            const [fromRaw, toRaw] = line.split("-->").map((part) => part.trim());
            const clean = (value: string) => value.replace(/^[A-Za-z0-9_]+/, "").replace(/[[\]{}()"]/g, "").trim() || value.replace(/[[\]{}()"]/g, "").trim();
            return { from: clean(fromRaw), to: clean(toRaw) };
        });

    if (edges.length === 0) {
        return <pre className="overflow-x-auto whitespace-pre-wrap p-4 text-xs">{chart}</pre>;
    }

    return (
        <div className="space-y-3 p-4">
            {edges.map((edge, index) => (
                <div key={`${edge.from}-${edge.to}-${index}`} className="flex items-center gap-2 text-xs">
                    <div className="min-w-0 flex-1 rounded border border-primary/20 bg-primary/5 px-3 py-2 font-medium">{edge.from}</div>
                    <div className="h-px w-8 bg-border" />
                    <div className="min-w-0 flex-1 rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 font-medium">{edge.to}</div>
                </div>
            ))}
        </div>
    );
}

function ArtifactPanel({ artifact }: { artifact: WidgetArtifact }) {
    if (artifact.type === "chart") {
        return (
            <div className="mt-3 overflow-hidden rounded border border-border bg-white">
                <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold">
                    <BarChart3 className="h-3.5 w-3.5 text-primary" />
                    {artifact.title}
                </div>
                <ChartArtifact chart={artifact.data} />
            </div>
        );
    }

    if (artifact.type === "mermaid") {
        return (
            <div className="mt-3 overflow-hidden rounded border border-border bg-white">
                <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold">
                    <GitBranch className="h-3.5 w-3.5 text-primary" />
                    {artifact.title}
                </div>
                <MermaidFlow chart={artifact.data} />
            </div>
        );
    }

    if (artifact.type === "questions") {
        return (
            <div className="mt-3 overflow-hidden rounded border border-border bg-white">
                <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    {artifact.title}
                </div>
                <div className="max-h-72 space-y-2 overflow-y-auto p-3">
                    {artifact.data.map((question: any, index: number) => (
                        <div key={index} className="rounded border border-border/60 p-2 text-xs">
                            <p className="font-medium">{question.label || question.title || `Question ${index + 1}`}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">{question.type || "question"}{question.required ? " · required" : ""}</p>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (artifact.type === "sections") {
        return (
            <div className="mt-3 overflow-hidden rounded border border-border bg-white">
                <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold">
                    <BarChart3 className="h-3.5 w-3.5 text-primary" />
                    {artifact.title}
                </div>
                <div className="grid max-h-72 gap-2 overflow-y-auto p-3 sm:grid-cols-2">
                    {artifact.data.map((section: any, index: number) => (
                        <div key={index} className="rounded border border-border/60 p-3 text-xs">
                            <p className="font-semibold">{section.title || `Section ${index + 1}`}</p>
                            <p className="mt-1 text-muted-foreground">{section.questions?.length || 0} questions</p>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="mt-3 overflow-hidden rounded border border-border bg-slate-950 text-slate-100">
            <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs font-semibold">
                <Code2 className="h-3.5 w-3.5" />
                {artifact.title}
            </div>
            <pre className="max-h-72 overflow-auto p-3 text-xs leading-relaxed"><code>{artifact.data}</code></pre>
        </div>
    );
}

const TOOL_ICONS: Record<string, string> = {
    execute_command: "⚡",
    read_file: "📖",
    write_file: "📝",
    edit_file: "✏️",
    list_directory: "📁",
    search_files: "🔍",
    web_search: "🌐",
    web_fetch: "🌐",
};



function ToolCallBubble({ name, args }: { name: string; args?: Record<string, unknown> }) {
    const [isOpen, setIsOpen] = useState(false);
    const icon = TOOL_ICONS[name] || "🔧";

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
                <button className="flex w-full items-center gap-2 rounded border border-border bg-muted/20 px-3 py-2 text-left transition-all hover:bg-muted/40">
                    <span>{icon}</span>
                    <Wrench className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground/80">{name}</span>
                    <div className="flex-1" />
                    <span className="font-mono text-[11px] text-muted-foreground animate-pulse">...</span>
                    {args && <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />}
                </button>
            </CollapsibleTrigger>
            {args && (
                <CollapsibleContent>
                    <pre className="mt-1 max-h-32 overflow-x-auto rounded border border-border bg-muted/50 p-3 font-mono text-[11px] text-muted-foreground">
                        {JSON.stringify(args, null, 2)}
                    </pre>
                </CollapsibleContent>
            )}
        </Collapsible>
    );
}

function ToolResultBubble({ name, result }: { name: string; result: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const isLong = result.length > 200;
    const preview = result.length > 200 ? `${result.slice(0, 150)}...` : result;

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
                <button className="flex w-full items-center gap-2 rounded border border-border bg-muted/20 px-3 py-1.5 text-left transition-all hover:bg-muted/40">
                    <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground/80">{name || "Tool"} completed</span>
                    <div className="flex-1" />
                    {isLong && <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />}
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <pre className="mt-1 max-h-48 overflow-x-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-3 font-mono text-[11px] text-muted-foreground">
                    {result}
                </pre>
            </CollapsibleContent>
            {!isOpen && isLong && (
                <pre className="truncate px-3 py-1.5 font-mono text-[10px] text-muted-foreground/60">
                    {preview}
                </pre>
            )}
        </Collapsible>
    );
}

function parseMessageContent(content: string) {
    const parts: { type: string; content: string; title?: string; parsedJson?: any }[] = [];
    const tokenRegex = /(<(think|thought)>([\s\S]*?)(?:<\/\2>|$))|(<tool_call>\s*([\s\S]*?)(?:<\/tool_call>|$))|(<tool_result>\s*([\s\S]*?)(?:<\/tool_result>|$))|(^Exit code:\s+\d+[\s\S]*?(?=\n\n|$))/gm;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ type: "text", content: content.substring(lastIndex, match.index) });
        }

        if (match[1]) {
            parts.push({ type: "thought", content: match[3], title: "Thinking Process" });
        } else if (match[4]) {
            let parsedJson = null;
            let toolName = "tool";
            try {
                parsedJson = JSON.parse(match[5].trim());
                toolName = parsedJson.name || "tool";
            } catch {
                // Streaming JSON can be incomplete; show a generic tool bubble.
            }
            parts.push({ type: "tool_call", content: match[5], title: toolName, parsedJson });
        } else if (match[6]) {
            parts.push({ type: "tool_result", content: match[7].trim(), title: "Result" });
        } else if (match[8]) {
            parts.push({ type: "execution", content: match[8].trim(), title: "Execution Log" });
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
        parts.push({ type: "text", content: content.substring(lastIndex) });
    }

    return parts;
}

function MarkdownContent({ content }: { content: string }) {
    const RM: any = ReactMarkdown;

    return (
        <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-a:text-primary prose-strong:text-foreground prose-code:text-primary [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <RM
                remarkPlugins={[remarkGfm]}
                components={{
                    code: ({ className, children, ...props }: any) => {
                        const match = /language-(\w+)/.exec(className || "");
                        const isBlock = String(children).includes("\n");

                        if (isBlock && match) {
                            const code = String(children).replace(/\n$/, "");
                            return (
                                <div className="group/code my-3 overflow-hidden rounded border border-border">
                                    <div className="flex items-center justify-between bg-zinc-900 px-4 py-2">
                                        <span className="text-[11px] font-medium text-zinc-400">{match[1]}</span>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
                                            onClick={() => {
                                                navigator.clipboard.writeText(code);
                                                toast.success("Code copied");
                                            }}
                                            title="Copy code"
                                        >
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <pre className="overflow-x-auto bg-zinc-950 p-4 text-[13px] leading-relaxed">
                                        <code className={`${className} text-zinc-100`} {...props}>{children}</code>
                                    </pre>
                                </div>
                            );
                        }

                        if (isBlock) {
                            return (
                                <pre className="my-3 overflow-x-auto rounded bg-muted p-4">
                                    <code className="font-mono text-[13px]" {...props}>{children}</code>
                                </pre>
                            );
                        }

                        return (
                            <code className="rounded border border-border/50 bg-muted/80 px-1.5 py-0.5 font-mono text-[13px] text-primary/90" {...props}>
                                {children}
                            </code>
                        );
                    },
                    a: ({ children, ...props }: any) => (
                        <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">{children}</a>
                    ),
                    p: ({ children }: any) => <p className="my-2.5 leading-[1.75] text-foreground/90">{children}</p>,
                    ul: ({ children }: any) => <ul className="my-2.5 ml-1 list-none space-y-1.5">{children}</ul>,
                    ol: ({ children }: any) => <ol className="my-2.5 ml-5 list-decimal space-y-1.5">{children}</ol>,
                    li: ({ children, ordered, ...props }: any) => (
                        <li className="flex gap-2 leading-relaxed" {...props}>
                            {!ordered && <span className="mt-1.5 shrink-0 text-primary">•</span>}
                            <span>{children}</span>
                        </li>
                    ),
                    h1: ({ children }: any) => <h1 className="mb-3 mt-6 border-b border-border pb-2 text-lg font-bold text-foreground">{children}</h1>,
                    h2: ({ children }: any) => <h2 className="mb-2 mt-5 text-base font-bold text-foreground">{children}</h2>,
                    h3: ({ children }: any) => <h3 className="mb-1.5 mt-4 text-sm font-bold text-foreground">{children}</h3>,
                    blockquote: ({ children }: any) => (
                        <blockquote className="my-3 rounded-r bg-muted/30 border-l-4 border-primary/30 py-2 pl-4 pr-3 italic text-muted-foreground">{children}</blockquote>
                    ),
                    table: ({ children }: any) => (
                        <div className="my-4 overflow-x-auto rounded border border-border">
                            <table className="min-w-full">{children}</table>
                        </div>
                    ),
                    thead: ({ children }: any) => <thead className="bg-muted/70">{children}</thead>,
                    th: ({ children }: any) => <th className="border-b border-border px-4 py-2.5 text-left text-xs font-semibold text-foreground">{children}</th>,
                    td: ({ children }: any) => <td className="border-b border-border/50 px-4 py-2.5 text-xs">{children}</td>,
                }}
            >
                {content}
            </RM>
        </div>
    );
}

function WidgetMessageBubble({
    message,
    isExpanded,
    onEditMessage,
    onRegenerate,
}: {
    message: WidgetMessage;
    isExpanded: boolean;
    onEditMessage?: (messageId: string, content: string) => void;
    onRegenerate?: () => void;
}) {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(message.content);
    const isUser = message.role === "user";

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(message.content);
        toast.success("Copied to clipboard");
    }, [message.content]);

    const handleDownload = useCallback(() => {
        const blob = new Blob([message.content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `maxxie-response-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Downloaded response");
    }, [message.content]);

    if (isUser) {
        return (
            <div className="flex w-full justify-end">
                <div className="flex max-w-[78%] flex-col items-end gap-1">
                    {isEditing ? (
                        <div className="flex w-full min-w-[260px] flex-col gap-2">
                            <Textarea
                                value={editText}
                                onChange={(event) => setEditText(event.target.value)}
                                className="min-h-24 resize-none rounded-xl border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed focus-visible:ring-primary/40"
                            />
                            <div className="flex justify-end gap-1.5">
                                <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setIsEditing(false)}>
                                    <X className="h-3.5 w-3.5" />
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 gap-1.5 text-xs"
                                    disabled={!editText.trim()}
                                    onClick={() => {
                                        const trimmed = editText.trim();
                                        if (!trimmed) return;
                                        onEditMessage?.(message.id, trimmed);
                                        setIsEditing(false);
                                    }}
                                >
                                    <Check className="h-3.5 w-3.5" />
                                    Done
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="relative rounded-2xl bg-primary px-5 py-3 text-primary-foreground shadow-sm">
                            <div className="absolute -bottom-1 right-0 h-4 w-4 rounded-tl-2xl bg-white" />
                            <p className="relative z-10 whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                        </div>
                    )}

                    {!isEditing && (
                        <div className="flex items-center gap-1 pr-1">
                            <button type="button" onClick={handleCopy} title="Copy" className="group rounded-lg p-1.5 transition-all hover:bg-muted">
                                <Copy className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                            </button>
                            <button type="button" onClick={() => setIsEditing(true)} title="Edit" className="group rounded-lg p-1.5 transition-all hover:bg-muted">
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-full justify-center">
            <div className={`${isExpanded ? "max-w-[860px]" : "max-w-[92%]"} w-full`}>
                {/* <div className="mb-1 ml-0.5 flex items-center gap-1.5">
                    {message.isStreaming && <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />}
                </div> */}

                <div className="px-4 py-3 text-sm leading-relaxed">
                    {message.content ? (
                        <>
                            {parseMessageContent(cleanAssistantMarkdown(message.content)).map((part, index, allParts) => {
                                if (part.type === "text" && part.content.trim()) {
                                    return <MarkdownContent key={index} content={part.content} />;
                                }
                                if (part.type === "thought") {
                                    const isLastPart = index === allParts.length - 1;
                                    return (
                                        <Reasoning
                                            key={index}
                                            isStreaming={message.isStreaming && isLastPart}
                                        >
                                            <ReasoningTrigger />
                                            <ReasoningContent>{part.content}</ReasoningContent>
                                        </Reasoning>
                                    );
                                }
                                if (part.type === "tool_call") {
                                    return (
                                        <div key={index} className="my-1 w-full">
                                            <ToolCallBubble name={part.title || "tool"} args={part.parsedJson?.arguments} />
                                        </div>
                                    );
                                }
                                if (part.type === "tool_result") {
                                    return (
                                        <div key={index} className="my-1 w-full">
                                            <ToolResultBubble name={part.title || "Result"} result={part.content} />
                                        </div>
                                    );
                                }
                                if (part.type === "execution") {
                                    return (
                                        <Collapsible key={index}>
                                            <CollapsibleTrigger asChild>
                                                <button className="my-2 flex w-full items-center gap-2 rounded border border-border bg-muted/30 px-3 py-2 text-left transition-all hover:bg-muted/50">
                                                    <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                                                    <span className="text-xs font-medium text-muted-foreground">{part.title}</span>
                                                    <div className="flex-1" />
                                                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                                </button>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent>
                                                <pre className="max-h-48 overflow-x-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-3 font-mono text-[11px] text-muted-foreground">
                                                    {part.content}
                                                </pre>
                                            </CollapsibleContent>
                                        </Collapsible>
                                    );
                                }
                                return null;
                            })}
                            {message.isStreaming && <span className="ml-1 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-primary" />}
                        </>
                    ) : (
                        <Reasoning isStreaming={message.isStreaming}>
                            <ReasoningTrigger />
                            <ReasoningContent>{""}</ReasoningContent>
                        </Reasoning>
                    )}

                    {!message.isStreaming && message.artifacts?.map((artifact, artifactIndex) => (
                        <ArtifactPanel key={`${artifact.type}-${artifactIndex}`} artifact={artifact} />
                    ))}
                </div>

                {!message.isStreaming && (
                    <div className="mt-2 flex items-center gap-1">
                        <button type="button" onClick={handleCopy} title="Copy" className="group rounded-lg p-2 transition-all hover:bg-muted">
                            <Copy className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                        </button>
                        {onRegenerate && (
                            <button type="button" onClick={onRegenerate} title="Regenerate" className="group rounded-lg p-2 transition-all hover:bg-muted">
                                <RefreshCw className="h-4 w-4 text-muted-foreground duration-500 group-hover:rotate-180 group-hover:text-foreground" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                if (isSpeaking) {
                                    window.speechSynthesis?.cancel();
                                    setIsSpeaking(false);
                                    return;
                                }
                                const utterance = new SpeechSynthesisUtterance(message.content);
                                utterance.lang = "en-US";
                                utterance.onend = () => setIsSpeaking(false);
                                utterance.onerror = () => setIsSpeaking(false);
                                window.speechSynthesis?.speak(utterance);
                                setIsSpeaking(true);
                            }}
                            title={isSpeaking ? "Stop reading" : "Read aloud"}
                            className="group rounded-lg p-2 transition-all hover:bg-muted"
                        >
                            {isSpeaking ? (
                                <VolumeX className="h-4 w-4 text-red-400 animate-pulse group-hover:text-red-500" />
                            ) : (
                                <Volume2 className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                            )}
                        </button>
                        <button type="button" onClick={() => toast.success("Feedback submitted")} title="Like" className="group rounded-lg p-2 transition-all hover:bg-muted">
                            <ThumbsUp className="h-4 w-4 text-muted-foreground group-hover:text-green-500" />
                        </button>
                        <button type="button" onClick={() => toast.success("Feedback submitted")} title="Dislike" className="group rounded-lg p-2 transition-all hover:bg-muted">
                            <ThumbsDown className="h-4 w-4 text-muted-foreground group-hover:text-red-500" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ForeFormAIWidget() {
    const user = { full_name: "User", email: "user@lucosms.app" };
    const location = useLocation();
    const navigate = useNavigate();

    const [isChatStarted, setIsChatStarted] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [inputText, setInputText] = useState("");
    const [messages, setMessages] = useState<WidgetMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [readAloud, setReadAloud] = useState(false);
    const [commandMenuOpen, setCommandMenuOpen] = useState(false);
    const [commandSearch, setCommandSearch] = useState("");
    const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

    const recognitionRef = useRef<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const streamRunRef = useRef(0);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const { data: forms = [] } = useQuery({
        queryKey: ["forms", "aitipsy"],
        queryFn: () => base44.entities.Form.list(),
        enabled: true,
        staleTime: 60000,
    });

    const { data: documents = [] } = useQuery({
        queryKey: ["documents", "aitipsy"],
        queryFn: () => base44.entities.Document.list(),
        enabled: true,
        staleTime: 60000,
    });

    const excludedPatterns = ["/login", "/signup", "/agent", "/complex-ai", "/bookmark-tasks", "/bookmark-documents", "/connectors", "/schedules", "/forms/:id/review", "/forms/:id/responses",];
    const isExcludedPage = excludedPatterns.some((pattern) => {
        const patternParts = pattern.split("/").filter(Boolean);
        const pathParts = location.pathname.split("/").filter(Boolean);
        if (patternParts.length !== pathParts.length) return false;
        return patternParts.every((part, i) => part.startsWith(":") || part === pathParts[i]);
    });

    const suggestedForms = useMemo(() => findMatchingForms(forms, inputText || "published active response").slice(0, 3), [forms, inputText]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isLoading]);

    useEffect(() => {
        return () => {
            streamRunRef.current += 1;
            window.speechSynthesis?.cancel();
        };
    }, []);

    if (!user || isExcludedPage) return null;

    const speak = (text: string) => {
        if (!readAloud || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`>-]/g, ""));
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
    };

    const startListening = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: "Speech to text is not available in this browser yet. You can still type, and I can correct grammar or rewrite it." }]);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.onresult = (event: any) => {
            const transcript = Array.from(event.results).map((result: any) => result[0].transcript).join("");
            setInputText(transcript);
        };
        recognition.onend = () => setIsListening(false);
        recognition.onerror = () => setIsListening(false);
        recognitionRef.current = recognition;
        setIsListening(true);
        recognition.start();
    };

    const stopListening = () => {
        recognitionRef.current?.stop();
        setIsListening(false);
    };

    const handleNavigate = (path: string) => {
        setIsChatStarted(false);
        navigate(path);
    };

    const streamAssistantMessage = async (messageId: string, content: string) => {
        const runId = ++streamRunRef.current;
        const tokens = tokenizeForStreaming(content);
        let visible = "";

        for (let index = 0; index < tokens.length; index += 1) {
            if (streamRunRef.current !== runId) return;

            visible += tokens[index];
            setMessages((prev) => prev.map((message) => (
                message.id === messageId
                    ? { ...message, content: visible, isStreaming: true }
                    : message
            )));

            const token = tokens[index];
            const pause = /[.!?]\s*$/.test(token) ? 90 : /[,;:]\s*$/.test(token) ? 55 : 18;
            await delay(pause);
        }

        if (streamRunRef.current !== runId) return;

        const artifacts = extractArtifacts(content);
        setMessages((prev) => prev.map((message) => (
            message.id === messageId
                ? { ...message, content, artifacts, isStreaming: false }
                : message
        )));
    };

    const handleSend = async (overridePrompt?: string) => {
        const rawPrompt = (overridePrompt ?? inputText).trim();
        if (!rawPrompt || isLoading) return;
        // Resolve slash command prefixes typed inline (e.g. "/grammar hello world")
        const prompt = rawPrompt.startsWith("/grammar ")
            ? `Correct the grammar and wording of this text: ${rawPrompt.slice("/grammar ".length)}`
            : rawPrompt;

        const matchingForms = findMatchingForms(forms, prompt);
        const matchingDocuments = findMatchingDocuments(documents, prompt);
        const experts = buildExpertBriefs({
            prompt,
            route: location.pathname,
            matchingForms,
            matchingDocuments,
            totalForms: forms.length,
            totalDocuments: documents.length,
        });
        const assistantId = uid();
        setIsChatStarted(true);
        setMessages((prev) => [
            ...prev,
            { id: uid(), role: "user", content: prompt },
            { id: assistantId, role: "assistant", content: "", isStreaming: true },
        ]);
        setInputText("");
        setIsLoading(true);

        try {
            const result = await base44.integrations.Core.InvokeLLM({
                prompt: `You are Maxxie, the ForeForm workspace assistant.

Internal execution model:
- Treat the following planning notes as private backend/tool context.
- Route attention to the highest-confidence briefs first, reconcile conflicts, remove duplication, and produce one clean final answer.
- Do not mention internal planning, scoring, tools, or implementation details unless the user explicitly asks how Maxxie works.
- Do not expose private chain-of-thought.
- Use artifacts deliberately: Mermaid for flows, chart JSON for graphs, JSON for form drafts, and code blocks for implementation patterns.

Current route: ${location.pathname}
User: ${user.full_name || user.email || "ForeForm user"}

Private planning notes:
${JSON.stringify(experts.map((expert) => ({
                    source: expert.name,
                    role: expert.role,
                    confidence: expert.confidence,
                    findings: expert.findings,
                    handoff: expert.handoff,
                })), null, 2)}

Use this workspace context before answering. If the user asks to search, compare, audit, or explain forms/files, cite the matching items by title/name.

Matching forms:
${JSON.stringify(matchingForms.map(summarizeForm), null, 2)}

Matching documents/files:
${JSON.stringify(matchingDocuments.map((doc: any) => ({
                    id: doc.id,
                    name: doc.name || doc.original_name,
                    type: doc.type,
                    size: doc.size,
                    url: doc.file_url || doc.url,
                })), null, 2)}

Response design pattern:
- Prefer concise sections, tables, checklists, and direct next actions.
- If a workflow or relationship is useful, include a Mermaid diagram in a \`\`\`mermaid code block.
- If a comparison, ranking, count, risk score, or distribution is useful, include a chart in a \`\`\`chart code block using this JSON shape: {"title":"Chart title","type":"bar","summary":"Optional short sentence","data":[{"label":"Name","value":3}]}.
- If the user asks for a form draft, return a JSON array of questions or sections in a \`\`\`json code block after a short explanation.
- If code/config is useful, include a fenced code artifact.
- The answer should feel direct and capable, not like a demo of an architecture pattern.
- Do not invent forms or files that are not in the supplied context.

User request:
${prompt}`,
            });

            const content = typeof result === "string" ? result : result?.text || "I could not produce a response.";
            await streamAssistantMessage(assistantId, content);
            speak(content);
        } catch (error: any) {
            const fallback = `I could not reach Maxxie right now. You can still use these shortcuts:\n\n- Open **Dashboard** to find forms.\n- Open **AI Respondents** to generate synthetic responses.\n- Open **AI Builder** to create a form from a prompt.\n\nError: ${error?.message || "Unknown error"}`;
            await streamAssistantMessage(assistantId, fallback);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setInputText(val);
        if (val.startsWith("/") && !val.includes(" ")) {
            const search = val.slice(1).toLowerCase();
            setCommandSearch(search);
            setCommandMenuOpen(true);
            setSelectedCommandIndex(0);
        } else {
            setCommandMenuOpen(false);
        }
    };

    const selectCommand = (cmd: typeof COMMANDS[0]) => {
        setCommandMenuOpen(false);
        if (cmd.type === "navigate") {
            setInputText("");
            handleNavigate(cmd.path!);
        } else if (cmd.type === "prefix") {
            setInputText("/" + cmd.name + " ");
            setTimeout(() => inputRef.current?.focus(), 0);
        } else {
            setInputText("");
            handleSend(cmd.prompt);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (commandMenuOpen) {
            const filtered = COMMANDS.filter(
                (c) => commandSearch === "" || c.name.startsWith(commandSearch) || c.label.toLowerCase().includes(commandSearch)
            );
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedCommandIndex((i) => Math.min(i + 1, filtered.length - 1));
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedCommandIndex((i) => Math.max(i - 1, 0));
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[selectedCommandIndex]) selectCommand(filtered[selectedCommandIndex]);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setCommandMenuOpen(false);
                return;
            }
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleRestart = () => {
        streamRunRef.current += 1;
        window.speechSynthesis?.cancel();
        setMessages([]);
        setIsChatStarted(false);
        setIsExpanded(false);
        setInputText("");
        setIsLoading(false);
    };

    const filteredCommands = COMMANDS.filter(
        (c) => commandSearch === "" || c.name.startsWith(commandSearch) || c.label.toLowerCase().includes(commandSearch)
    );

    const inputAreaNode = (
        <div className={`rounded border border-primary/30 bg-white p-2 shadow-sm ${isChatStarted ? "" : "w-[340px]"}`}>
            <div className="relative">
                {commandMenuOpen && filteredCommands.length > 0 && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded border border-border bg-white shadow-2xl" style={{ zIndex: 60 }}>
                        <div className="border-b border-border/50 px-3 py-2">
                            <p className="text-[12px] font-semibold text-muted-foreground">Commands</p>
                        </div>
                        <div className="max-h-64 overflow-y-auto py-1">
                            {filteredCommands.map((cmd, i) => {
                                const Icon = cmd.icon;
                                const isSelected = i === selectedCommandIndex;
                                return (
                                    <button
                                        key={cmd.name}
                                        type="button"
                                        onMouseDown={(e) => { e.preventDefault(); selectCommand(cmd); }}
                                        onMouseEnter={() => setSelectedCommandIndex(i)}
                                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                                            }`}
                                    >
                                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center ${isSelected ? "s" : ""
                                            }`}>
                                            <Icon className={`h-3.5 w-3.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>/{cmd.name}</span>
                                                {cmd.type === "navigate" && (
                                                    <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-500">nav</span>
                                                )}
                                                {cmd.type === "prefix" && (
                                                    <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-500">type</span>
                                                )}
                                            </div>
                                            <p className="truncate text-xs text-muted-foreground">{cmd.description}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="border-t border-border/50 px-3 py-1.5">
                            <p className="text-[10px] text-muted-foreground/60">↑↓ navigate · Enter select · Esc close</p>
                        </div>
                    </div>
                )}
                <div className="flex items-end gap-2">
                    <Button type="button" variant="ghost" size="icon" className={isListening ? "text-primary" : "text-muted-foreground"} onClick={isListening ? stopListening : startListening} title="Speech to text">
                        <Mic className="h-4 w-4" />
                    </Button>
                    <Textarea
                        ref={inputRef}
                        value={inputText}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask Maxxie"
                        className="min-h-10 flex-1 resize-none border-0 bg-transparent p-2 text-sm shadow-none focus-visible:ring-0"
                        rows={1}
                    />
                    <Button type="button" size="icon" disabled={!inputText.trim() || isLoading} onClick={() => handleSend()} title="Send">
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end font-sans sm:bottom-6 sm:right-6">
            <AnimatePresence mode="wait">
                {!isChatStarted ? (
                    <motion.div key="launcher" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                        <div className="hidden rounded shadow-xl sm:block">{inputAreaNode}</div>
                        <Button onClick={() => setIsChatStarted(true)} className="h-14 w-14 rounded-full shadow-2xl sm:hidden" size="icon">
                            <img src='/icons/ai.svg' alt="AI" className="h-10 w-10 object-contain invert saturate-200" />
                        </Button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="chat"
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{
                            opacity: 1,
                            scale: 1,
                            y: 0,
                            width: isExpanded ? "calc(100vw - 32px)" : 400,
                            height: isExpanded ? "calc(100dvh - 32px)" : 590,
                        }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded border border-border bg-white shadow-2xl"
                    >
                        <div className="flex items-center justify-between border-b border-border px-4 py-3">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center">
                                    <img src='/icons/ai.svg' alt="AI" className="h-10 w-10 object-contain" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">Maxxie</p>
                                    <p className="text-[11px] text-muted-foreground">ForeForm AI</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setReadAloud((value) => !value)} title="Read answers aloud">
                                    {readAloud ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsExpanded((value) => !value)}>
                                    {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRestart}>
                                    <RotateCcw className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsChatStarted(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>



                        <div className="flex-1 space-y-4 overflow-y-auto bg-muted/20 p-4">
                            {messages.length === 0 && (
                                <div className="rounded border border-dashed border-border bg-white p-4 text-sm text-muted-foreground">
                                    <p className="font-medium text-foreground">What I can do</p>
                                    <ul className="mt-2 list-disc space-y-1 pl-5">
                                        <li>Search and summarize forms in your workspace.</li>
                                        <li>Analyze question quality, missing fields, response patterns, and next actions.</li>
                                        <li>Generate diagrams, charts, form drafts, and implementation examples.</li>
                                        <li>Guide you through ForeForm pages with quick navigation.</li>
                                        <li>Listen to speech, clean grammar, and read answers aloud.</li>
                                    </ul>
                                </div>
                            )}

                            {suggestedForms.length > 0 && messages.length === 0 && (
                                <div className="rounded border border-border bg-white p-3">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent form shortcuts</p>
                                    <div className="space-y-2">
                                        {suggestedForms.map((form: any) => (
                                            <button key={form.id} onClick={() => handleNavigate(`/forms/${form.id}/edit`)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-muted">
                                                <FileText className="h-4 w-4 text-primary" />
                                                <span className="min-w-0 flex-1 truncate text-sm font-medium">{form.title}</span>
                                                <span className="text-xs text-muted-foreground">{form.response_count || 0} responses</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {messages.map((message) => (
                                <WidgetMessageBubble
                                    key={message.id}
                                    message={message}
                                    isExpanded={isExpanded}
                                    onEditMessage={(messageId, content) => {
                                        setMessages((prev) => prev.map((item) => (
                                            item.id === messageId ? { ...item, content } : item
                                        )));
                                    }}
                                    onRegenerate={
                                        message.role === "assistant" && messages[messages.length - 1]?.id === message.id
                                            ? () => {
                                                const lastUserMessage = [...messages].reverse().find((item) => item.role === "user");
                                                if (lastUserMessage) handleSend(lastUserMessage.content);
                                            }
                                            : undefined
                                    }
                                />
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="border-t border-border bg-white p-3">{inputAreaNode}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
