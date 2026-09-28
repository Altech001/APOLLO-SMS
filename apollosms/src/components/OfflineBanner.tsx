import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export default function OfflineBanner() {
    const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

    useEffect(() => {
        const update = () => setOffline(!navigator.onLine);
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);

    if (!offline) return null;
    return (
        <div role="status" className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-zinc-900 text-white text-xs font-medium px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            You're not connected to the internet
        </div>
    );
}
