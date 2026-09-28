import { AIModelInfo, apollosmsApi } from "@/api/apollosms";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Cpu, Sparkles } from "lucide-react";

export const AI_MODELS_KEY = ["apollosms", "ai-models"] as const;

/** Loads the chat models (with live status), refreshed every minute while the chat is open. */
export function useAIModels() {
    return useQuery<AIModelInfo[]>({
        queryKey: AI_MODELS_KEY,
        queryFn: () => apollosmsApi.ai.models(),
        staleTime: 30 * 1000,
        refetchInterval: 60 * 1000,
    });
}

const STATUS_DOT: Record<AIModelInfo["status"], string> = {
    available: "bg-emerald-500",
    busy: "bg-amber-500",
    unavailable: "bg-muted-foreground/40",
};

const STATUS_LABEL: Record<AIModelInfo["status"], string> = {
    available: "Available",
    busy: "Busy, will retry shortly",
    unavailable: "Unavailable",
};

/** Human name for a model id, using the model list when it's loaded. */
export function modelLabel(id: string | undefined, models: AIModelInfo[] | undefined) {
    if (!id) return "";
    return models?.find((m) => m.id === id)?.label || id.split("/").pop() || id;
}

interface ModelPickerProps {
    /** Selected model id; "" means Auto. */
    value: string;
    onChange: (id: string) => void;
}

/** Compact model menu for the composer. Auto is the default; any choice keeps the others as fallbacks. */
export default function ModelPicker({ value, onChange }: ModelPickerProps) {
    const { data: models = [] } = useAIModels();
    const selected = models.find((m) => m.id === value);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors max-w-[160px]"
                    title="Choose the AI model"
                >
                    {selected ? <Cpu className="w-3.5 h-3.5 shrink-0" /> : <Sparkles className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">{selected ? selected.label : "Auto"}</span>
                    {selected && selected.status !== "available" && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[selected.status])} />}
                    <ChevronDown className="w-3 h-3 shrink-0 opacity-70" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-72">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    If a model is busy, Apollo switches to the next one automatically.
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onChange("")} className="flex items-start gap-2.5 py-2 cursor-pointer">
                    <Sparkles className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                    <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium">Auto</span>
                        <span className="block text-[11px] text-muted-foreground">Recommended: the best available model</span>
                    </span>
                    {!value && <Check className="w-4 h-4 mt-0.5 shrink-0" />}
                </DropdownMenuItem>
                {models.length > 0 && <DropdownMenuSeparator />}
                {models.map((m) => (
                    <DropdownMenuItem
                        key={m.id}
                        disabled={m.status === "unavailable"}
                        onSelect={() => onChange(m.id)}
                        className="flex items-start gap-2.5 py-2 cursor-pointer"
                    >
                        <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", STATUS_DOT[m.status])} title={STATUS_LABEL[m.status]} />
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm">{m.label}</span>
                            <span className="block text-[11px] text-muted-foreground">
                                {m.status === "available" ? m.description : STATUS_LABEL[m.status]}
                            </span>
                        </span>
                        {value === m.id && <Check className="w-4 h-4 mt-0.5 shrink-0" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
