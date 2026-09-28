import { apollosmsApi, StockPhoto, WhatsAppButton, WhatsAppRich } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import { usePaidFeatures } from "@/hooks/use-billing-summary";
import { cn } from "@/lib/utils";
import { ImageIcon, Images, Link2, Loader2, MessageSquareReply, Phone, Plus, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { buttonProblem, MAX_BUTTONS } from "./whatsapp-rich";

type BannerTab = "upload" | "stock" | "ai";

const BUTTON_TYPES: Array<{ type: WhatsAppButton["type"]; label: string; icon: React.ReactNode; placeholder?: string }> = [
    { type: "url", label: "Link", icon: <Link2 className="w-3.5 h-3.5" />, placeholder: "https://yourshop.ug/order" },
    { type: "call", label: "Call", icon: <Phone className="w-3.5 h-3.5" />, placeholder: "+256 7XX XXX XXX" },
    { type: "reply", label: "Quick reply", icon: <MessageSquareReply className="w-3.5 h-3.5" /> },
];

const field = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

interface Props {
    value: WhatsAppRich;
    onChange: (next: WhatsAppRich) => void;
    /** Suggested stock search for the banner, e.g. from a template or the assistant. */
    imageQuery?: string;
    className?: string;
}

export default function WhatsAppRichEditor({ value, onChange, imageQuery, className }: Props) {
    const [tab, setTab] = useState<BannerTab>("stock");
    const [query, setQuery] = useState(imageQuery || "");
    const [photos, setPhotos] = useState<StockPhoto[]>([]);
    const [prompt, setPrompt] = useState("");
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const buttons = value.buttons || [];
    const { aiImages } = usePaidFeatures();

    const set = (patch: Partial<WhatsAppRich>) => onChange({ ...value, ...patch });
    const setButton = (i: number, patch: Partial<WhatsAppButton>) => set({ buttons: buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });

    const run = async (task: () => Promise<void>) => {
        setBusy(true);
        try {
            await task();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Something went wrong");
        } finally {
            setBusy(false);
        }
    };

    const searchStock = () =>
        run(async () => {
            if (query.trim().length < 2) throw new Error("Type what the photo should show");
            const res = await apollosmsApi.ai.searchStock(query.trim(), "landscape");
            setPhotos(res.photos);
            if (!res.photos.length) toast.info("No photos found. Try other words.");
        });

    const generate = () =>
        run(async () => {
            if (prompt.trim().length < 3) throw new Error("Describe the banner you want");
            const res = await apollosmsApi.ai.generateImage({ prompt: prompt.trim(), aspect: "landscape" });
            set({ image_url: res.url });
        });

    const upload = (file: File) =>
        run(async () => {
            const res = await apollosmsApi.whatsapp.uploadImage(file);
            set({ image_url: res.url });
        });

    return (
        <div className={cn("space-y-4", className)}>
            <section className="space-y-2">
                <p className="text-xs font-semibold">Banner image</p>
                {value.image_url ? (
                    <div className="relative w-full max-w-sm overflow-hidden rounded-lg border border-border">
                        <img src={value.image_url} alt="" className="w-full max-h-48 object-cover" />
                        <button
                            type="button"
                            onClick={() => set({ image_url: undefined })}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                            aria-label="Remove banner"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
                        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
                            {([
                                ["stock", "Stock photo", <Images key="s" className="w-3.5 h-3.5" />],
                                ["upload", "Upload", <Upload key="u" className="w-3.5 h-3.5" />],
                                ["ai", "AI", <Sparkles key="a" className="w-3.5 h-3.5" />],
                            ] as const).filter(([id]) => id !== "ai" || aiImages).map(([id, label, icon]) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setTab(id)}
                                    className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium", tab === id ? "bg-background shadow-sm" : "text-muted-foreground")}
                                >
                                    {icon}
                                    {label}
                                </button>
                            ))}
                        </div>

                        {tab === "stock" && (
                            <div className="space-y-2">
                                <form
                                    className="flex gap-2"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        searchStock();
                                    }}
                                >
                                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. fresh juice market" className={field} />
                                    <Button type="submit" size="sm" disabled={busy} className="h-9 gap-1.5 shrink-0">
                                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                                        Search
                                    </Button>
                                </form>
                                {photos.length > 0 && (
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {photos.slice(0, 8).map((p) => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => set({ image_url: p.full })}
                                                className="aspect-video overflow-hidden rounded-md hover:ring-2 hover:ring-primary"
                                                style={{ backgroundColor: p.avg_color }}
                                                title={`Photo by ${p.photographer} on Pexels`}
                                            >
                                                <img src={p.thumb} alt={p.alt} loading="lazy" className="w-full h-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {photos.length > 0 && <p className="text-[10px] text-muted-foreground">Photos from Pexels, free to use.</p>}
                            </div>
                        )}

                        {tab === "upload" && (
                            <div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) upload(file);
                                        e.target.value = "";
                                    }}
                                />
                                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()} className="h-9 gap-1.5">
                                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                    Choose image
                                </Button>
                                <p className="text-[10px] text-muted-foreground mt-1.5">JPEG, PNG or WebP, up to 5 MB.</p>
                            </div>
                        )}

                        {tab === "ai" && aiImages && (
                            <form
                                className="flex gap-2"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    generate();
                                }}
                            >
                                <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. bright banner of fresh juice glasses on a market stall" className={field} />
                                <Button type="submit" size="sm" disabled={busy} className="h-9 gap-1.5 shrink-0">
                                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                                    Generate
                                </Button>
                            </form>
                        )}
                    </div>
                )}
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1.5">
                    <span className="text-xs font-semibold">Header</span>
                    <input value={value.header || ""} maxLength={60} onChange={(e) => set({ header: e.target.value })} placeholder="Bold title, e.g. ⚡ Flash Sale" className={field} />
                </label>
                <label className="space-y-1.5">
                    <span className="text-xs font-semibold">Footer</span>
                    <input value={value.footer || ""} maxLength={60} onChange={(e) => set({ footer: e.target.value })} placeholder="e.g. Reply STOP to opt out" className={field} />
                </label>
            </section>

            <section className="space-y-2">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">Buttons</p>
                    <span className="text-[10px] text-muted-foreground">Shown as tappable lines · up to {MAX_BUTTONS}</span>
                </div>
                {buttons.map((b, i) => {
                    const problem = buttonProblem(b);
                    const meta = BUTTON_TYPES.find((t) => t.type === b.type)!;
                    return (
                        <div key={i} className="rounded-lg border border-border p-2 space-y-2">
                            <div className="flex items-center gap-2">
                                <select
                                    value={b.type}
                                    onChange={(e) => setButton(i, { type: e.target.value as WhatsAppButton["type"], value: "" })}
                                    className="h-9 rounded-lg border border-border bg-background px-2 text-xs"
                                >
                                    {BUTTON_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
                                </select>
                                <input value={b.text} maxLength={25} onChange={(e) => setButton(i, { text: e.target.value })} placeholder="Button text" className={field} />
                                <button type="button" onClick={() => set({ buttons: buttons.filter((_, idx) => idx !== i) })} className="p-2 text-muted-foreground hover:text-rose-600" aria-label="Remove button">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            {b.type !== "reply" && (
                                <input value={b.value || ""} onChange={(e) => setButton(i, { value: e.target.value })} placeholder={meta.placeholder} className={field} />
                            )}
                            {problem && <p className="text-[11px] text-amber-600">{problem}</p>}
                        </div>
                    );
                })}
                {buttons.length < MAX_BUTTONS && (
                    <div className="flex flex-wrap gap-1.5">
                        {BUTTON_TYPES.map((t) => (
                            <Button
                                key={t.type}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => set({ buttons: [...buttons, { type: t.type, text: "", value: "" }] })}
                                className="h-8 text-xs gap-1.5"
                            >
                                <Plus className="w-3 h-3" />
                                {t.icon}
                                {t.label}
                            </Button>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
