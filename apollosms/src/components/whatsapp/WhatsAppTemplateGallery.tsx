import { apollosmsApi, SMSTemplateResponse, WhatsAppRich } from "@/api/apollosms";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Images } from "lucide-react";
import { useMemo, useState } from "react";
import { WHATSAPP_TEMPLATE_PRESETS } from "./whatsapp-rich";
import WhatsAppPreview from "./WhatsAppPreview";

export interface PickedWhatsAppTemplate {
    body: string;
    rich: WhatsAppRich;
    imageQuery?: string;
}

interface Card extends PickedWhatsAppTemplate {
    id: string;
    name: string;
    category: string;
}

const MINE = "My templates";

export default function WhatsAppTemplateGallery({ open, onOpenChange, onUse }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUse: (template: PickedWhatsAppTemplate) => void;
}) {
    const [category, setCategory] = useState("All");
    const { data: saved = [] } = useQuery<SMSTemplateResponse[]>({
        queryKey: ["apollosms", "sms-templates"],
        queryFn: () => apollosmsApi.smsTemplates.list(),
        enabled: open,
    });

    const cards: Card[] = useMemo(() => {
        const mine = saved
            .filter((t) => t.channel === "whatsapp")
            .map((t) => ({ id: `mine-${t.id}`, name: t.name, category: MINE, body: t.content || t.body, rich: t.extras || {} }));
        const presets = WHATSAPP_TEMPLATE_PRESETS.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            body: p.body,
            imageQuery: p.imageQuery,
            rich: { header: p.header, footer: p.footer, buttons: p.buttons },
        }));
        return [...mine, ...presets];
    }, [saved]);

    const categories = ["All", ...Array.from(new Set(cards.map((c) => c.category)))];
    const shown = category === "All" ? cards : cards.filter((c) => c.category === category);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60">
                    <DialogTitle>WhatsApp templates</DialogTitle>
                    <DialogDescription>Pick a layout, then edit the text, banner and buttons before sending.</DialogDescription>
                    <div className="flex gap-1.5 overflow-x-auto pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {categories.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setCategory(c)}
                                className={cn(
                                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
                                    category === c ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {shown.map((card) => (
                        <button
                            key={card.id}
                            type="button"
                            onClick={() => {
                                onUse({ body: card.body, rich: card.rich, imageQuery: card.imageQuery });
                                onOpenChange(false);
                            }}
                            className="text-left rounded border border-border hover:border-primary/60 hover:shadow-md transition-all overflow-hidden"
                        >
                            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60">
                                <span className="text-sm font-medium truncate">{card.name}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">{card.category}</span>
                            </div>
                            {card.imageQuery && !card.rich.image_url && (
                                <div className="flex items-center gap-1.5 px-3 pt-2 text-[10px] text-muted-foreground">
                                    <Images className="w-3 h-3" />
                                    Comes with a banner photo
                                </div>
                            )}
                            <WhatsAppPreview message={card.body} rich={card.rich} className="rounded-none pointer-events-none max-h-72 overflow-hidden" />
                        </button>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
