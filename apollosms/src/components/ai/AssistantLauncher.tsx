import { cn } from "@/lib/utils";
import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const HINT_KEY = "apollo-launcher-hint-seen";

function hintSeen() {
    try {
        return localStorage.getItem(HINT_KEY) === "1";
    } catch {
        return true;
    }
}

function markHintSeen() {
    try {
        localStorage.setItem(HINT_KEY, "1");
    } catch {
        // ignore
    }
}

export default function AssistantLauncher() {
    const navigate = useNavigate();
    const [showHint, setShowHint] = useState(false);

    useEffect(() => {
        if (hintSeen()) return;
        const show = window.setTimeout(() => setShowHint(true), 1200);
        const hide = window.setTimeout(() => {
            setShowHint(false);
            markHintSeen();
        }, 9000);
        return () => {
            window.clearTimeout(show);
            window.clearTimeout(hide);
        };
    }, []);

    const open = () => {
        markHintSeen();
        navigate("/chat");
    };

    return (
        <div className="fixed z-40 right-4 bottom-4 sm:right-6 sm:bottom-6 flex flex-col items-end gap-2 pb-[env(safe-area-inset-bottom)]">
            {showHint && (
                <div className="relative max-w-[220px] rounded-2xl rounded-br-sm border border-border bg-card px-3.5 py-2.5 text-xs shadow-lg animate-in fade-in slide-in-from-bottom-2">
                    <button
                        type="button"
                        onClick={() => {
                            setShowHint(false);
                            markHintSeen();
                        }}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center hover:text-foreground"
                        aria-label="Dismiss"
                    >
                        <X className="w-3 h-3" />
                    </button>
                    <p className="font-semibold text-foreground">Need a hand?</p>
                    <p className="text-muted-foreground mt-0.5">Ask Apollo to write, send or plan your next campaign.</p>
                </div>
            )}
            <button
                type="button"
                onClick={open}
                aria-label="Open Apollo AI assistant"
                className={cn(
                    "group relative flex items-center h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30",
                    "pl-4 pr-4 hover:pr-5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/40 active:scale-95",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                )}
            >
                <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping [animation-duration:3s] group-hover:hidden" />
                <img src="/icons/ai.webp" sizes="40" className="relative w-8 h-8 shrink-0 center" />
                <span className="relative max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-300 group-hover:max-w-[120px] group-hover:ml-2 group-focus-visible:max-w-[120px] group-focus-visible:ml-2">
                    Ask Apollo
                </span>
            </button>
        </div>
    );
}
