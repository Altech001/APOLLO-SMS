import { AITemplateResponse, AIWriteMode, apollosmsApi, MessageChannel } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AlignLeft, Briefcase, Check, Loader2, Minimize2, Sparkles, Wand2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const REWRITE_OPTIONS: Array<{ mode: Exclude<AIWriteMode, "create">; label: string; icon: React.ReactNode }> = [
    { mode: "polish", label: "Polish", icon: <Check className="w-3.5 h-3.5" /> },
    { mode: "elaborate", label: "Elaborate", icon: <AlignLeft className="w-3.5 h-3.5" /> },
    { mode: "formalise", label: "Formalise", icon: <Briefcase className="w-3.5 h-3.5" /> },
    { mode: "shorten", label: "Shorten", icon: <Minimize2 className="w-3.5 h-3.5" /> },
];

export interface HelpMeWriteProps {
    /** Current text in the field; used as a first draft or rewritten by Polish/Elaborate/Formalise/Shorten. */
    content: string;
    channel: MessageChannel;
    category?: string;
    /** Receives the AI draft. The previous text is passed so the host can offer Undo. */
    onResult: (draft: AITemplateResponse, mode: AIWriteMode, previous: string) => void;
    className?: string;
}

/** "Help me write" button that opens an AI writing popover, anchored inside a text field. */
export default function HelpMeWrite({ content, channel, category, onResult, className }: HelpMeWriteProps) {
    const [open, setOpen] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [mode, setMode] = useState<Exclude<AIWriteMode, "create"> | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    const hasContent = content.trim().length > 0;
    const effectiveMode: AIWriteMode = mode && hasContent ? mode : "create";
    const canSubmit = !isWorking && (effectiveMode !== "create" || prompt.trim().length >= 3 || hasContent);

    const handleSubmit = async () => {
        if (effectiveMode === "create" && prompt.trim().length < 3 && !hasContent) {
            toast.error("Describe the message you want in a few words");
            return;
        }
        setIsWorking(true);
        try {
            const draft = await apollosmsApi.ai.generateTemplate({
                prompt: prompt.trim() || undefined,
                content: hasContent ? content : undefined,
                mode: effectiveMode === "create" && !prompt.trim() ? "polish" : effectiveMode,
                channel,
                category,
            });
            onResult(draft, effectiveMode, content);
            setOpen(false);
            setPrompt("");
            setMode(null);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to write with AI");
        } finally {
            setIsWorking(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={(next) => !isWorking && setOpen(next)}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold",
                        "bg-primary/10 text-primary hover:bg-primary/20 transition-colors",
                        className
                    )}
                >
                    <Sparkles className="w-3.5 h-3.5" />
                    Help me write
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" sideOffset={8} className="w-[380px] max-w-[calc(100vw-2rem)] p-4 rounded-xl shadow-2xl">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-foreground">Help me write</h3>
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <textarea
                    autoFocus
                    rows={4}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) handleSubmit();
                    }}
                    maxLength={1000}
                    placeholder={
                        mode && hasContent
                            ? "Optional: add an extra instruction, e.g. 'mention our Kampala branch'"
                            : "You can enter things like:\n• a few words that sum up your message\n• a first draft\n• 'remind customers their order is ready for pickup'"
                    }
                    className="w-full rounded-lg border border-border bg-muted/20 p-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />

                <div className="flex flex-wrap gap-2 mt-3">
                    {REWRITE_OPTIONS.map((option) => {
                        const selected = mode === option.mode;
                        return (
                            <button
                                key={option.mode}
                                type="button"
                                disabled={!hasContent}
                                title={hasContent ? undefined : "Write or generate some text first"}
                                onClick={() => setMode(selected ? null : option.mode)}
                                className={cn(
                                    "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-colors",
                                    selected
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "border-primary/40 text-primary hover:bg-primary/10",
                                    !hasContent && "opacity-40 cursor-not-allowed hover:bg-transparent"
                                )}
                            >
                                {selected ? <Check className="w-3.5 h-3.5" /> : option.icon}
                                {option.label}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-end justify-between gap-3 mt-4">
                    <p className="text-[11px] text-muted-foreground leading-snug">
                        Your text is sent to NVIDIA AI to write this draft. Review it before saving.
                    </p>
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="h-10 px-5 rounded-full gap-2 shrink-0"
                    >
                        {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                        {isWorking ? "Writing..." : effectiveMode === "create" ? "Create" : "Rewrite"}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
