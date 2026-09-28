import { AIChatAttachment, AIChatMessage, apollosmsApi, ApiError, ContactGroupResponse, ContactResponse, renultApi, SERVER_DOWN_MESSAGE } from "@/api/apollosms";
import ChatActionCard, { ChatActionState } from "@/components/ai/ChatActionCard";
import ChatHistoryPanel, { AI_CONVERSATIONS_KEY } from "@/components/ai/ChatHistoryPanel";
import { CHAT_FILE_ACCEPT, ChatFile, formatBytes, readChatFile, toAttachment } from "@/components/ai/chat-utils";
import ModelPicker, { AI_MODELS_KEY, modelLabel, useAIModels } from "@/components/ai/ModelPicker";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useBillingSummary } from "@/hooks/use-billing-summary";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    ArrowUp,
    Brain,
    ChevronRight,
    Copy,
    FileSpreadsheet,
    FileText,
    History,
    ImagePlus,
    ListChecks,
    Loader2,
    MessageCircle,
    MessageSquare,
    Plus,
    RotateCcw,
    Sparkles,
    SquarePen,
    Upload,
    Wallet,
    X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

interface ChatEntry {
    id: string;
    role: "user" | "assistant";
    content: string;
    /** User turns: files attached to this message (text summary only; rows live in `files`). */
    attachments?: AIChatAttachment[];
    actions?: ChatActionState[];
    thinking?: string;
    plan?: string[];
    /** The model that answered; a fallback model may not share reasoning. */
    model?: string;
    /** The model the user picked, when not Auto; differs from `model` when Apollo switched. */
    requestedModel?: string;
    /** How long the assistant took, shown as "Thought for Xs". */
    elapsedMs?: number;
    thought?: boolean;
    /** Set when the request for this user message failed, so it can be retried. */
    failed?: boolean;
    /** Friendly reason shown next to Retry. */
    error?: string;
}

/** The saved conversation a chat belongs to. A new chat gets its id on first save. */
interface ChatSession {
    id: number | null;
    /** Set when the chat was deleted, so queued saves don't recreate or touch it. */
    deleted?: boolean;
}

/** Chats from before history moved to the server; imported once, then removed. */
const LEGACY_STORAGE_KEY = "apollo-ai-chat";
const CURRENT_KEY = "apollo-ai-current";
const THINK_KEY = "apollo-ai-think";
const MODEL_KEY = "apollo-ai-model";
/** Wait before quietly asking again when every model was busy. */
const AUTO_RETRY_DELAY = 2500;
const MAX_INPUT = 4000;
const SAVE_DELAY = 700;

const SUGGESTIONS = [
    { icon: <MessageSquare className="w-4 h-4" />, text: "Send an SMS to 0772123456 saying our shop opens at 9am tomorrow" },
    { icon: <MessageCircle className="w-4 h-4" />, text: "Send a WhatsApp promo to all my contacts about 20% off this weekend" },
    { icon: <FileSpreadsheet className="w-4 h-4" />, text: "Attach a spreadsheet and send each customer an SMS with their outstanding balance", attach: true },
    { icon: <ImagePlus className="w-4 h-4" />, text: "Design a flyer image for our weekend sale on fresh juice" },
];

const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function readStorage<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

function writeStorage(key: string, value: unknown) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage can be full or blocked; these are only conveniences.
    }
}

/** The conversation as the backend expects it: failed turns dropped, card state stripped. */
function toApiMessages(entries: ChatEntry[]): AIChatMessage[] {
    return entries
        .filter((e) => !e.failed)
        .map((e) => ({
            role: e.role,
            content: e.content,
            attachments: e.attachments,
            actions: e.actions?.map(({ status: _status, result: _result, image: _image, stock: _stock, note: _note, ...action }) => action),
        }));
}

const markdownClass =
    "prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-2 prose-p:leading-relaxed prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:mt-4 prose-headings:mb-2 prose-pre:bg-muted prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none prose-table:text-xs prose-th:px-2 prose-td:px-2";

function Markdown({ children, className }: { children: string; className?: string }) {
    return (
        <div className={cn(markdownClass, className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
                    table: ({ node: _node, ...props }) => <div className="overflow-x-auto"><table {...props} /></div>,
                }}
            >
                {children}
            </ReactMarkdown>
        </div>
    );
}

function AttachmentChip({ name, detail, kind, loading, onRemove }: {
    name: string;
    detail?: string;
    kind?: "spreadsheet" | "document";
    loading?: boolean;
    onRemove?: () => void;
}) {
    return (
        <span className="inline-flex items-center gap-2 max-w-[260px] rounded-lg border border-border bg-muted/40 pl-2 pr-1.5 py-1.5 text-xs">
            {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
            ) : kind === "spreadsheet" ? (
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
                <FileText className="w-4 h-4 text-primary shrink-0" />
            )}
            <span className="truncate font-medium">{name}</span>
            {detail && <span className="text-muted-foreground shrink-0">{detail}</span>}
            {onRemove && (
                <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground shrink-0" aria-label={`Remove ${name}`}>
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </span>
    );
}

const attachmentDetail = (a: { kind: string; rows?: number; size?: number }) =>
    a.kind === "spreadsheet" && a.rows !== undefined ? `${a.rows.toLocaleString()} rows` : a.size !== undefined ? formatBytes(a.size) : undefined;

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    onClick={onClick}
                    disabled={disabled}
                    aria-label={label}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                    {children}
                </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
    );
}

export default function ChatPage() {
    const queryClient = useQueryClient();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
    const [entries, setEntries] = useState<ChatEntry[]>([]);
    const [conversationId, setConversationId] = useState<number | null>(null);
    const [title, setTitle] = useState("");
    const [isLoadingChat, setIsLoadingChat] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [input, setInput] = useState("");
    const [think, setThink] = useState(() => readStorage(THINK_KEY, false));
    const [images, setImages] = useState(true);
    /** Preferred model; "" is Auto. */
    const [model, setModel] = useState(() => readStorage(MODEL_KEY, ""));
    const [reconnecting, setReconnecting] = useState(false);
    const { data: models } = useAIModels();
    const [isThinking, setIsThinking] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    /** Files attached to the message being written. */
    const [pendingFiles, setPendingFiles] = useState<ChatFile[]>([]);
    const [readingFiles, setReadingFiles] = useState<string[]>([]);
    /** Every file read in this visit, so file-based sends can use all rows. */
    const [files, setFiles] = useState<ChatFile[]>([]);
    const [dragging, setDragging] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { summary } = useBillingSummary();

    // Saving: edits mark the chat dirty, and a debounced save runs through one queue so a new chat
    // is created exactly once. Each chat has its own session object, so a save that finishes after
    // switching chats still lands on the chat it belongs to.
    const sessionRef = useRef<ChatSession>({ id: null });
    const dirtyRef = useRef(false);
    const saveTimerRef = useRef<number>();
    const pendingSaveRef = useRef<{ session: ChatSession; entries: ChatEntry[] } | null>(null);
    const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

    const { data: contacts = [] } = useQuery<ContactResponse[]>({
        queryKey: ["apollosms", "contacts", "ai-chat"],
        queryFn: () => renultApi.contacts.list() as Promise<ContactResponse[]>,
        staleTime: 5 * 60 * 1000,
    });
    const { data: groups = [] } = useQuery<ContactGroupResponse[]>({
        queryKey: ["apollosms", "contact-groups", "ai-chat"],
        queryFn: () => renultApi.contactGroups.list() as Promise<ContactGroupResponse[]>,
        staleTime: 5 * 60 * 1000,
    });

    const runSave = useCallback(
        (session: ChatSession, snapshot: ChatEntry[]) => {
            saveQueueRef.current = saveQueueRef.current.then(async () => {
                if (session.deleted) return;
                try {
                    const res = session.id
                        ? await apollosmsApi.ai.conversations.update<ChatEntry>(session.id, { messages: snapshot })
                        : await apollosmsApi.ai.conversations.create<ChatEntry>({ messages: snapshot });
                    const created = session.id === null;
                    session.id = res.id;
                    if (sessionRef.current === session) {
                        if (created) {
                            setConversationId(res.id);
                            writeStorage(CURRENT_KEY, res.id);
                        }
                        setTitle(res.title);
                    }
                    queryClient.invalidateQueries({ queryKey: AI_CONVERSATIONS_KEY });
                } catch (error) {
                    // Saving is best-effort and retried quietly; the next edit saves the whole chat again.
                    console.warn("AI chat not saved, retrying", error);
                    if (!session.deleted) window.setTimeout(() => runSave(session, snapshot), 5000);
                }
            });
        },
        [queryClient]
    );

    /** Saves any pending change now, e.g. before switching chats. */
    const flushSave = useCallback(() => {
        window.clearTimeout(saveTimerRef.current);
        const pending = pendingSaveRef.current;
        pendingSaveRef.current = null;
        if (pending) runSave(pending.session, pending.entries);
    }, [runSave]);

    /** Changes the open chat's entries and schedules a save. */
    const editEntries = useCallback((update: ChatEntry[] | ((current: ChatEntry[]) => ChatEntry[])) => {
        dirtyRef.current = true;
        setEntries(update);
    }, []);

    useEffect(() => {
        if (!dirtyRef.current) return;
        dirtyRef.current = false;
        if (entries.length === 0) return;
        pendingSaveRef.current = { session: sessionRef.current, entries };
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(flushSave, SAVE_DELAY);
    }, [entries, flushSave]);

    // Save before leaving the page.
    useEffect(() => () => flushSave(), [flushSave]);

    const openChat = useCallback(
        async (id: number) => {
            flushSave();
            setIsLoadingChat(true);
            try {
                const chat = await apollosmsApi.ai.conversations.get<ChatEntry>(id);
                sessionRef.current = { id: chat.id };
                setConversationId(chat.id);
                setTitle(chat.title);
                setEntries(Array.isArray(chat.messages) ? chat.messages : []);
                writeStorage(CURRENT_KEY, chat.id);
            } catch (error) {
                if (error instanceof ApiError && error.status === 404) writeStorage(CURRENT_KEY, null);
                else toast.error(error instanceof Error ? error.message : "Could not open the chat");
            } finally {
                setIsLoadingChat(false);
            }
        },
        [flushSave]
    );

    const newChat = useCallback(() => {
        if (isThinking) return;
        flushSave();
        sessionRef.current = { id: null };
        setConversationId(null);
        setTitle("");
        setEntries([]);
        setInput("");
        setPendingFiles([]);
        writeStorage(CURRENT_KEY, null);
        inputRef.current?.focus();
    }, [flushSave, isThinking]);

    // On first visit: import a chat kept in browser storage by the earlier version, else reopen the last chat.
    useEffect(() => {
        const legacy = readStorage<ChatEntry[]>(LEGACY_STORAGE_KEY, []);
        if (legacy.length > 0) {
            writeStorage(LEGACY_STORAGE_KEY, null);
            setEntries(legacy);
            runSave(sessionRef.current, legacy);
            return;
        }
        const lastId = readStorage<number | null>(CURRENT_KEY, null);
        if (lastId) openChat(lastId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const handler = (e: Event) => setSidebarCollapsed((e as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    useEffect(() => writeStorage(THINK_KEY, think), [think]);
    useEffect(() => writeStorage(MODEL_KEY, model), [model]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [entries.length, isThinking]);

    useEffect(() => {
        if (!isThinking) return;
        const started = Date.now();
        setElapsed(0);
        const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
        return () => window.clearInterval(timer);
    }, [isThinking]);

    // Grow the input with its content, up to a limit.
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    }, [input]);

    const addFiles = async (list: FileList | File[]) => {
        for (const file of Array.from(list)) {
            setReadingFiles((r) => [...r, file.name]);
            try {
                const read = await readChatFile(file);
                setPendingFiles((current) => [...current.filter((f) => f.name !== read.name), read]);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : `Could not read ${file.name}`);
            } finally {
                setReadingFiles((r) => r.filter((n) => n !== file.name));
            }
        }
        inputRef.current?.focus();
    };

    /** Asks the assistant; the server already switches models, and one quiet retry covers a busy moment. */
    const requestAnswer = async (history: ChatEntry[]) => {
        const payload = toApiMessages(history);
        try {
            return await apollosmsApi.ai.chat(payload, { think, images, model });
        } catch (error) {
            if (error instanceof ApiError && (error.code === "offline" || (error.status > 0 && error.status < 500 && error.status !== 429))) throw error;
            setReconnecting(true);
            await new Promise((resolve) => window.setTimeout(resolve, AUTO_RETRY_DELAY));
            setReconnecting(false);
            return await apollosmsApi.ai.chat(payload, { think, images, model });
        }
    };

    const ask = async (history: ChatEntry[]) => {
        setIsThinking(true);
        const started = Date.now();
        try {
            const res = await requestAnswer(history);
            editEntries([
                ...history,
                {
                    id: newId(),
                    role: "assistant",
                    content: res.reply,
                    thinking: res.thinking,
                    plan: res.plan,
                    model: res.model,
                    requestedModel: model || undefined,
                    thought: think,
                    elapsedMs: Date.now() - started,
                    actions: res.actions.map((a) => ({ ...a, status: "pending" as const })),
                },
            ]);
        } catch (error) {
            const reason = error instanceof ApiError ? error.message : SERVER_DOWN_MESSAGE;
            editEntries(history.map((e, i) => (i === history.length - 1 ? { ...e, failed: true, error: reason } : e)));
        } finally {
            setIsThinking(false);
            setReconnecting(false);
            queryClient.invalidateQueries({ queryKey: AI_MODELS_KEY });
            inputRef.current?.focus();
        }
    };

    const send = (text: string = input) => {
        const content = text.trim();
        if ((!content && !pendingFiles.length) || isThinking || isLoadingChat || readingFiles.length) return;
        if (content.length > MAX_INPUT) return toast.error(`Keep your message under ${MAX_INPUT} characters`);
        const attached = pendingFiles;
        const history: ChatEntry[] = [
            ...entries,
            {
                id: newId(),
                role: "user",
                content: content || `Here is ${attached.map((f) => f.name).join(", ")}.`,
                attachments: attached.length ? attached.map(toAttachment) : undefined,
            },
        ];
        setFiles((current) => [...current.filter((f) => !attached.some((a) => a.name === f.name)), ...attached]);
        setPendingFiles([]);
        editEntries(history);
        setInput("");
        ask(history);
    };

    const retry = (id: string) => {
        const index = entries.findIndex((e) => e.id === id);
        const history = entries.slice(0, index + 1).map((e) => (e.id === id ? { ...e, failed: false, error: undefined } : e));
        editEntries(history);
        ask(history);
    };

    const updateAction = (entryId: string, actionIndex: number, next: ChatActionState) =>
        editEntries((current) =>
            current.map((e) => (e.id === entryId ? { ...e, actions: e.actions?.map((a, i) => (i === actionIndex ? next : a)) } : e))
        );

    const copy = (text: string) => {
        navigator.clipboard.writeText(text).then(
            () => toast.success("Copied"),
            () => toast.error("Could not copy")
        );
    };

    const isEmpty = entries.length === 0;
    const canSend = (!!input.trim() || pendingFiles.length > 0) && !isThinking && !isLoadingChat && readingFiles.length === 0;
    const heading = title || (isEmpty ? "New chat" : "Untitled chat");

    return (
        <TooltipProvider delayDuration={300}>
            <div
                className={cn("h-screen flex flex-col bg-background transition-all duration-300 relative", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}
                onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("Files")) {
                        e.preventDefault();
                        setDragging(true);
                    }
                }}
                onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
                }}
            >
                <SEO title={title ? `${title} · AI Assistant` : "AI Assistant"} />
                <AppHeader onCreateForm={() => { }} />

                {dragging && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
                        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary px-10 py-8 text-primary">
                            <Upload className="w-8 h-8" />
                            <p className="text-sm font-semibold">Drop files to attach</p>
                            <p className="text-xs text-muted-foreground">CSV, Excel, PDF, Word or text</p>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-12 border-b border-border/40">
                    <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="w-4 h-4 text-primary shrink-0" />
                        <h1 className={cn("text-sm font-medium truncate", !title && "text-muted-foreground")} title={heading}>
                            {heading}
                        </h1>
                        {isLoadingChat && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <IconButton label="New chat" onClick={newChat} disabled={isEmpty || isThinking}>
                            <SquarePen className="w-[18px] h-[18px]" />
                        </IconButton>
                        <IconButton label="Chat history" onClick={() => setHistoryOpen(true)}>
                            <History className="w-[18px] h-[18px]" />
                        </IconButton>
                    </div>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto">
                    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
                        {isEmpty && !isLoadingChat && (
                            <div className="flex flex-col items-center text-center pt-10 sm:pt-20">
                                <h2 className="text-2xl sm:text-2xl font-semibold tracking-tight">What are we sending today?</h2>
                                <p className="text-sm text-muted-foreground mt-2 max-w-md break-words">
                                    Write and send SMS or WhatsApp, run campaigns. You approve every send.
                                </p>
                            </div>
                        )}

                        {entries.map((entry) =>
                            entry.role === "user" ? (
                                <div key={entry.id} className="flex flex-col items-end gap-1.5">
                                    {entry.attachments && (
                                        <div className="flex flex-wrap justify-end gap-1.5">
                                            {entry.attachments.map((a) => (
                                                <AttachmentChip key={a.name} name={a.name} kind={a.kind} detail={attachmentDetail(a)} />
                                            ))}
                                        </div>
                                    )}
                                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap break-words">
                                        {entry.content}
                                    </div>
                                    {entry.failed && (
                                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                            <span>{entry.error || "Apollo couldn't answer just now."}</span>
                                            <button
                                                type="button"
                                                onClick={() => retry(entry.id)}
                                                disabled={isThinking}
                                                className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-50"
                                            >
                                                <RotateCcw className="w-3 h-3" />
                                                Retry
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div key={entry.id} className="group space-y-3">
                                    {entry.thought && (
                                        <details className="group/think">
                                            <summary className="inline-flex items-center gap-1.5 cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground select-none">
                                                <Brain className="w-3.5 h-3.5" />
                                                Thought for {Math.max(1, Math.round((entry.elapsedMs || 0) / 1000))}s
                                                <ChevronRight className="w-3.5 h-3.5 transition-transform group-open/think:rotate-90" />
                                            </summary>
                                            <div className="mt-2 ml-1.5 pl-3 border-l-2 border-border">
                                                {entry.thinking ? (
                                                    <Markdown className="text-muted-foreground prose-p:text-xs prose-li:text-xs text-xs">{entry.thinking}</Markdown>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground italic">
                                                        {entry.model
                                                            ? `${modelLabel(entry.model, models)} answered without sharing its reasoning.`
                                                            : "No reasoning was returned for this answer."}
                                                    </p>
                                                )}
                                            </div>
                                        </details>
                                    )}
                                    <Markdown>{entry.content}</Markdown>
                                    {entry.plan && entry.plan.length > 0 && (
                                        <div className="rounded-xl border border-border/60 px-4 py-3">
                                            <p className="flex items-center gap-1.5 text-xs font-semibold mb-2 text-muted-foreground">
                                                <ListChecks className="w-4 h-4" />
                                                Plan
                                            </p>
                                            <ol className="space-y-1.5">
                                                {entry.plan.map((step, i) => (
                                                    <li key={i} className="flex gap-2 text-sm">
                                                        <span className="w-5 h-5 rounded-full bg-muted text-[11px] font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                                                        <span className="text-foreground/85">{step}</span>
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                    )}
                                    {entry.actions?.map((action, i) => (
                                        <ChatActionCard
                                            key={i}
                                            action={action}
                                            contacts={contacts}
                                            groups={groups}
                                            files={files}
                                            summary={summary}
                                            onChange={(next) => updateAction(entry.id, i, next)}
                                        />
                                    ))}
                                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">
                                        <button type="button" onClick={() => copy(entry.content)} className="flex items-center gap-1 hover:text-foreground">
                                            <Copy className="w-3 h-3" />
                                            Copy
                                        </button>
                                        {entry.model && <span>{modelLabel(entry.model, models)}</span>}
                                        {entry.model && entry.requestedModel && entry.requestedModel !== entry.model && (
                                            <span title="Your chosen model was busy, so Apollo switched automatically">
                                                · switched from {modelLabel(entry.requestedModel, models)} (busy)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )
                        )}

                        {isLoadingChat && isEmpty && (
                            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Opening chat…
                            </div>
                        )}

                        {isThinking && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                {think ? <Brain className="w-4 h-4 animate-pulse text-primary" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                                <span className="animate-pulse">{reconnecting ? "Busy moment, trying again" : think ? "Thinking" : "Writing"}…</span>
                                <span className="text-xs tabular-nums">{elapsed}s</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-background px-4 sm:px-6 pb-3 pt-1">
                    <form
                        className="max-w-3xl mx-auto"
                        onSubmit={(e) => {
                            e.preventDefault();
                            send();
                        }}
                    >
                        <div className="rounded-2xl border border-border bg-card shadow-sm transition-shadow focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
                            {(pendingFiles.length > 0 || readingFiles.length > 0) && (
                                <div className="flex flex-wrap gap-2 px-3 pt-3">
                                    {pendingFiles.map((f) => (
                                        <AttachmentChip
                                            key={f.id}
                                            name={f.name}
                                            kind={f.kind}
                                            detail={attachmentDetail({ kind: f.kind, rows: f.rows?.length, size: f.size })}
                                            onRemove={() => setPendingFiles((current) => current.filter((p) => p.id !== f.id))}
                                        />
                                    ))}
                                    {readingFiles.map((name) => <AttachmentChip key={name} name={name} detail="reading…" loading />)}
                                </div>
                            )}

                            <textarea
                                ref={inputRef}
                                autoFocus
                                rows={2}
                                value={input}
                                maxLength={MAX_INPUT}
                                onChange={(e) => setInput(e.target.value)}
                                onPaste={(e) => {
                                    if (e.clipboardData.files.length) {
                                        e.preventDefault();
                                        addFiles(e.clipboardData.files);
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                        e.preventDefault();
                                        send();
                                    }
                                }}
                                placeholder={pendingFiles.length ? "What should I do with this file?" : "Message Apollo…"}
                                className="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm leading-relaxed placeholder:text-muted-foreground/70 focus:outline-none min-h-[60px] max-h-[240px]"
                            />

                            <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
                                <div className="flex items-center gap-1 min-w-0">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        accept={CHAT_FILE_ACCEPT}
                                        className="hidden"
                                        onChange={(e) => {
                                            if (e.target.files?.length) addFiles(e.target.files);
                                            e.target.value = "";
                                        }}
                                    />
                                    <IconButton label="Attach CSV, Excel, PDF, Word or text" onClick={() => fileInputRef.current?.click()}>
                                        <Plus className="w-[18px] h-[18px]" />
                                    </IconButton>
                                    <ModelPicker value={model} onChange={setModel} />
                                    <button
                                        type="button"
                                        onClick={() => setThink((t) => !t)}
                                        aria-pressed={think}
                                        title={think ? "Thinking on: slower, better for files and multi-step tasks" : "Turn on thinking for files and multi-step tasks"}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-medium transition-colors",
                                            think ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                        )}
                                    >
                                        <Brain className="w-3.5 h-3.5" />
                                        Think
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setImages((on) => !on)}
                                        aria-pressed={images}
                                        title={images ? "Image generation on: Apollo draws flyers, artwork and status images when asked" : "Image generation off"}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-medium transition-colors",
                                            images ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                        )}
                                    >
                                        <ImagePlus className="w-3.5 h-3.5" />
                                        Image
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {summary && (
                                        <Link
                                            to="/sms-tp"
                                            title="Your balance. Click to top up"
                                            className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                                        >
                                            <Wallet className="w-3.5 h-3.5" />
                                            {(summary.sms_balance + summary.free_sms_remaining).toLocaleString()} SMS · {(summary.whatsapp_balance + summary.free_whatsapp_remaining).toLocaleString()} WA
                                        </Link>
                                    )}
                                    {input.length > MAX_INPUT - 500 && (
                                        <span className="text-[11px] text-muted-foreground tabular-nums">{input.length}/{MAX_INPUT}</span>
                                    )}
                                    <Button type="submit" size="icon" disabled={!canSend} className="h-8 w-8 rounded-full shrink-0" aria-label="Send">
                                        {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground/80 text-center mt-2">
                            Chris AI uses your contacts and history and can make mistakes. Check messages before sending.
                        </p>
                    </form>
                </div>

                <ChatHistoryPanel
                    open={historyOpen}
                    onOpenChange={setHistoryOpen}
                    activeId={conversationId}
                    busy={isThinking}
                    onSelect={(id) => id !== conversationId && openChat(id)}
                    onNewChat={newChat}
                    onRenamed={(id, next) => id === conversationId && setTitle(next)}
                    onDeleted={(id) => {
                        if (id !== conversationId) return;
                        // The open chat is gone: drop unsaved edits for it and start fresh.
                        window.clearTimeout(saveTimerRef.current);
                        pendingSaveRef.current = null;
                        sessionRef.current.deleted = true;
                        sessionRef.current = { id: null };
                        setConversationId(null);
                        setTitle("");
                        setEntries([]);
                        writeStorage(CURRENT_KEY, null);
                    }}
                />
            </div>
        </TooltipProvider>
    );
}
