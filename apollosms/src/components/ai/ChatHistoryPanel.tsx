import { AIConversationSummary, apollosmsApi } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, MessageSquareText, Pencil, Search, SquarePen, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const AI_CONVERSATIONS_KEY = ["apollosms", "ai-conversations"] as const;

interface ChatHistoryPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activeId: number | null;
    /** Opening another chat is blocked while the assistant is answering. */
    busy?: boolean;
    onSelect: (id: number) => void;
    onNewChat: () => void;
    /** Called after the open chat was renamed or deleted, so the page can follow. */
    onRenamed: (id: number, title: string) => void;
    onDeleted: (id: number) => void;
}

const DAY = 24 * 60 * 60 * 1000;

function groupLabel(date: Date, now: Date) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const t = date.getTime();
    if (t >= startOfToday) return "Today";
    if (t >= startOfToday - DAY) return "Yesterday";
    if (t >= startOfToday - 7 * DAY) return "Previous 7 days";
    if (t >= startOfToday - 30 * DAY) return "Previous 30 days";
    return date.toLocaleDateString([], { month: "long", year: "numeric" });
}

function timeLabel(date: Date, now: Date) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (date.getTime() >= startOfToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Right-hand panel listing the user's saved assistant chats. */
export default function ChatHistoryPanel({ open, onOpenChange, activeId, busy, onSelect, onNewChat, onRenamed, onDeleted }: ChatHistoryPanelProps) {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [renamingId, setRenamingId] = useState<number | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
    const [workingId, setWorkingId] = useState<number | null>(null);

    const { data: conversations = [], isLoading } = useQuery<AIConversationSummary[]>({
        queryKey: AI_CONVERSATIONS_KEY,
        queryFn: () => apollosmsApi.ai.conversations.list(),
        staleTime: 30 * 1000,
    });

    const groups = useMemo(() => {
        const now = new Date();
        const needle = search.trim().toLowerCase();
        const out: Array<{ label: string; items: AIConversationSummary[] }> = [];
        for (const c of conversations) {
            if (needle && !(c.title || "new chat").toLowerCase().includes(needle)) continue;
            const label = groupLabel(new Date(c.updated_at), now);
            const group = out.find((g) => g.label === label);
            if (group) group.items.push(c);
            else out.push({ label, items: [c] });
        }
        return out;
    }, [conversations, search]);

    const rename = async (id: number) => {
        const title = renameValue.trim();
        setRenamingId(null);
        if (!title) return;
        setWorkingId(id);
        try {
            await apollosmsApi.ai.conversations.update(id, { title });
            queryClient.setQueryData<AIConversationSummary[]>(AI_CONVERSATIONS_KEY, (list) => list?.map((c) => (c.id === id ? { ...c, title } : c)));
            onRenamed(id, title);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not rename the chat");
        } finally {
            setWorkingId(null);
        }
    };

    const remove = async (id: number) => {
        setConfirmDeleteId(null);
        setWorkingId(id);
        try {
            await apollosmsApi.ai.conversations.delete(id);
            queryClient.setQueryData<AIConversationSummary[]>(AI_CONVERSATIONS_KEY, (list) => list?.filter((c) => c.id !== id));
            onDeleted(id);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not delete the chat");
        } finally {
            setWorkingId(null);
        }
    };

    const now = new Date();

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col gap-0">
                <SheetHeader className="px-4 pt-4 pb-3 space-y-3 text-left border-b border-border/50">
                    <div className="pr-8">
                        <SheetTitle className="text-base">Chats</SheetTitle>
                        <SheetDescription className="text-xs">Your conversations with Chriss AI</SheetDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search chats"
                                className="w-full h-9 rounded border border-border bg-muted/30 pl-8 pr-3 text-sm focus:outline-none focus:border-primary focus:ring-primary/30"
                            />
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                                onNewChat();
                                onOpenChange(false);
                            }}
                            className="h-9 gap-1.5 text-xs"
                        >
                            <SquarePen className="w-3.5 h-3.5" />
                            New
                        </Button>
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-2 py-2">
                    {isLoading && (
                        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading chats…
                        </div>
                    )}
                    {!isLoading && groups.length === 0 && (
                        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                            <MessageSquareText className="w-6 h-6" />
                            {search ? "No chats match your search" : "No chats yet. Your conversations will appear here."}
                        </div>
                    )}
                    {groups.map((group) => (
                        <div key={group.label} className="mb-3">
                            <p className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
                            {group.items.map((c) => {
                                const active = c.id === activeId;
                                const title = c.title || "New chat";
                                if (renamingId === c.id) {
                                    return (
                                        <div key={c.id} className="flex items-center gap-1 px-1 py-1">
                                            <input
                                                autoFocus
                                                value={renameValue}
                                                onChange={(e) => setRenameValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") rename(c.id);
                                                    if (e.key === "Escape") setRenamingId(null);
                                                }}
                                                maxLength={60}
                                                className="flex-1 h-8 rounded border border-primary/50 bg-background px-2 text-sm focus:outline-none"
                                            />
                                            <button type="button" onClick={() => rename(c.id)} className="p-1.5 rounded hover:bg-muted" aria-label="Save name">
                                                <Check className="w-3.5 h-3.5" />
                                            </button>
                                            <button type="button" onClick={() => setRenamingId(null)} className="p-1.5 rounded hover:bg-muted" aria-label="Cancel">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    );
                                }
                                return (
                                    <div
                                        key={c.id}
                                        className={cn(
                                            "group relative flex items-center rounded transition-colors",
                                            active ? "bg-primary/10 text-primary" : "hover:bg-muted/60"
                                        )}
                                    >
                                        <button
                                            type="button"
                                            disabled={busy && !active}
                                            onClick={() => {
                                                onSelect(c.id);
                                                onOpenChange(false);
                                            }}
                                            className="flex-1 min-w-0 flex items-center justify-between gap-2 px-2.5 py-2 text-left disabled:opacity-50"
                                        >
                                            <span className={cn("truncate text-sm", active ? "font-medium" : "text-foreground/90", !c.title && "italic text-muted-foreground")}>
                                                {title}
                                            </span>
                                            <span className="shrink-0 text-[10px] text-muted-foreground group-hover:opacity-0 transition-opacity">
                                                {workingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : timeLabel(new Date(c.updated_at), now)}
                                            </span>
                                        </button>
                                        <div className="absolute right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity bg-inherit">
                                            {confirmDeleteId === c.id ? (
                                                <>
                                                    <button type="button" onClick={() => remove(c.id)} className="px-2 py-1 rounded-md text-[11px] font-semibold text-rose-600 hover:bg-rose-500/10">
                                                        Delete
                                                    </button>
                                                    <button type="button" onClick={() => setConfirmDeleteId(null)} className="p-1.5 rounded-md hover:bg-muted" aria-label="Cancel">
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setRenamingId(c.id);
                                                            setRenameValue(c.title);
                                                        }}
                                                        className="p-1.5 rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                                                        aria-label={`Rename ${title}`}
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmDeleteId(c.id)}
                                                        className="p-1.5 rounded-md text-muted-foreground hover:bg-background hover:text-rose-600"
                                                        aria-label={`Delete ${title}`}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    );
}
