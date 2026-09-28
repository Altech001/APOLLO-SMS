import { apollosmsApi, ApiError, SendWhatsAppResponse, WhatsAppAccountResponse, WhatsAppRich } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import { notifyBillingChange, useBillingSummary } from "@/hooks/use-billing-summary";
import { cn } from "@/lib/utils";
import { ChevronDown, LayoutTemplate, MessageCircle, Send, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { buttonProblem, CAPTION_LIMIT, composeWhatsAppText, isRichEmpty } from "./whatsapp-rich";
import WhatsAppPreview from "./WhatsAppPreview";
import WhatsAppRichEditor from "./WhatsAppRichEditor";
import WhatsAppTemplateGallery from "./WhatsAppTemplateGallery";

const WHATSAPP_MAX_LENGTH = 4096;

export interface WhatsAppComposerProps {
    /** Message text, owned by the host composer so SMS and WhatsApp share one input. */
    message: string;
    /** Lets the template gallery fill the host's message box. */
    onMessageChange?: (message: string) => void;
    /** Recipient phone numbers in any format; the backend normalizes them. */
    recipients: string[];
    /** Called after messages are queued so the host can reset its own state. */
    onSent?: (result: SendWhatsAppResponse) => void;
    /** Starting banner, header, footer and buttons (e.g. from the AI assistant). */
    initialRich?: WhatsAppRich;
    /** Stock photo keywords used to pick a banner automatically when there is none. */
    imageQuery?: string;
    /** Bumped by the host to force reloading linked numbers. */
    refreshKey?: number;
    className?: string;
}

export default function WhatsAppComposer({ message, onMessageChange, recipients, onSent, initialRich, imageQuery, refreshKey, className }: WhatsAppComposerProps) {
    const [accounts, setAccounts] = useState<WhatsAppAccountResponse[]>([]);
    const [accountId, setAccountId] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [needsPayment, setNeedsPayment] = useState(false);
    const [rich, setRich] = useState<WhatsAppRich>(initialRich || {});
    const [bannerQuery, setBannerQuery] = useState(imageQuery);
    const [showEditor, setShowEditor] = useState(!isRichEmpty(initialRich) || !!imageQuery);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const autoBannerFor = useRef<string>();
    const navigate = useNavigate();
    const { summary } = useBillingSummary();
    const canUseTemplates = !!summary?.features?.whatsapp_templates;

    const loadAccounts = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = (await apollosmsApi.whatsapp.accounts()).filter((account) => account.online);
            setAccounts(data);
            setAccountId((current) =>
                data.some((account) => String(account.id) === current) ? current : data[0] ? String(data[0].id) : ""
            );
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to load WhatsApp numbers");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAccounts();
    }, [loadAccounts, refreshKey]);

    useEffect(() => {
        const query = bannerQuery?.trim();
        if (!query || rich.image_url || autoBannerFor.current === query) return;
        autoBannerFor.current = query;
        apollosmsApi.ai
            .searchStock(query, "landscape")
            .then((res) => {
                const photo = res.photos[0];
                if (photo) setRich((current) => (current.image_url ? current : { ...current, image_url: photo.full }));
            })
            .catch(() => undefined);
    }, [bannerQuery, rich.image_url]);

    const trimmed = message.trim();
    const hasRich = !isRichEmpty(rich);
    const composed = composeWhatsAppText(trimmed, rich);
    const limit = rich.image_url ? CAPTION_LIMIT : WHATSAPP_MAX_LENGTH;
    const tooLong = composed.length > limit;
    const buttonIssue = (rich.buttons || []).map(buttonProblem).find(Boolean);
    const selected = accounts.find((account) => String(account.id) === accountId);
    const remainingToday = selected ? Math.max(0, selected.daily_limit - selected.sent_today - selected.queued) : 0;
    const isSandbox = selected?.provider === "sandbox";
    const available = (summary?.whatsapp_balance ?? 0) + (summary?.free_whatsapp_remaining ?? 0);
    const shortBy = summary && !isSandbox ? Math.max(0, recipients.length - available) : 0;

    const handleSend = async () => {
        if (!selected) return toast.error("Link a WhatsApp number first");
        if (recipients.length === 0) return toast.error("Please add at least one recipient");
        if (!trimmed && !rich.image_url) return toast.error("Please compose a message");
        if (buttonIssue) return toast.error(`Fix the buttons first: ${buttonIssue}`);

        setIsSending(true);
        setNeedsPayment(false);
        try {
            const result = await apollosmsApi.whatsapp.send({ account_id: selected.id, phones: recipients, message: trimmed, ...rich });
            const accepted = result.queued + result.sent;
            const summaryText = result.queued > 0
                ? `Queued ${result.queued} WhatsApp message${result.queued === 1 ? "" : "s"}; they are sent gradually`
                : `Sent ${result.sent} WhatsApp message${result.sent === 1 ? "" : "s"}`;
            if (result.failed === 0) {
                toast.success(summaryText);
            } else if (accepted > 0) {
                toast.warning(`${summaryText}. ${result.failed} skipped (${result.messages.find((m) => m.error)?.error || "invalid"}).`);
            } else {
                toast.error(`No messages sent: ${result.messages.find((m) => m.error)?.error || "all recipients failed"}`);
            }
            onSent?.(result);
            loadAccounts();
            notifyBillingChange();
        } catch (error) {
            if (error instanceof ApiError && error.status === 402) {
                setNeedsPayment(true);
                toast.error(error.message, {
                    action: { label: "Buy credits", onClick: () => navigate("/sms-tp?redeem=whatsapp") },
                });
                return;
            }
            toast.error(error instanceof Error ? error.message : "Unable to send WhatsApp message");
        } finally {
            setIsSending(false);
        }
    };

    if (!isLoading && accounts.length === 0) {
        return (
            <div className={cn("p-3 border border-dashed border-emerald-500/50 bg-emerald-500/5 rounded flex items-center justify-between gap-3", className)}>
                <div className="flex items-center gap-2 text-xs">
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                    <span>No WhatsApp number online. Link one or reconnect it first.</span>
                </div>
                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                    <Link to="/whatsapp">Manage numbers</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className={cn("space-y-3", className)}>
            <div className="flex flex-wrap items-center gap-2">
                {onMessageChange && canUseTemplates && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setGalleryOpen(true)} className="h-8 text-xs gap-1.5">
                        <LayoutTemplate className="w-3.5 h-3.5" />
                        Templates
                    </Button>
                )}
                <Button
                    type="button"
                    variant={showEditor ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setShowEditor((v) => !v)}
                    className="h-8 text-xs gap-1.5"
                >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Banner & buttons
                    {hasRich && !showEditor && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    <ChevronDown className={cn("w-3 h-3 transition-transform", showEditor && "rotate-180")} />
                </Button>
            </div>

            {showEditor && (
                <WhatsAppRichEditor
                    value={rich}
                    onChange={setRich}
                    imageQuery={bannerQuery}
                    className="rounded-lg border border-border/60 p-3"
                />
            )}

            <WhatsAppPreview message={trimmed} rich={rich} />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <label htmlFor="whatsapp-sender" className="text-xs font-semibold whitespace-nowrap">Send from</label>
                    <select
                        id="whatsapp-sender"
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                        disabled={isLoading}
                        className="h-9 sm:h-8 flex-1 min-w-0 sm:flex-none sm:min-w-[200px] text-xs bg-card border border-border rounded px-2"
                    >
                        {isLoading && <option>Loading numbers...</option>}
                        {accounts.map((account) => (
                            <option key={account.id} value={String(account.id)}>
                                +{account.phone_number} {account.display_name || account.push_name ? `· ${account.display_name || account.push_name}` : ""}
                                {account.provider === "sandbox" ? " (sandbox)" : ""}
                            </option>
                        ))}
                    </select>
                </div>
                <Button
                    type="button"
                    onClick={handleSend}
                    disabled={isSending || isLoading || !selected || recipients.length === 0 || (!trimmed && !rich.image_url) || tooLong || !!buttonIssue}
                    className="h-10 sm:h-9 w-full sm:w-auto text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                    <Send className="w-3.5 h-3.5" />
                    {isSending ? "Checking numbers..." : `Send via WhatsApp (${recipients.length})`}
                </Button>
            </div>

            {!isSandbox && summary && (
                <div
                    className={cn(
                        "flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border px-3 py-2 text-[11px]",
                        needsPayment || shortBy > 0
                            ? "border-rose-500/40 bg-rose-500/5 text-rose-600"
                            : "border-border/40 bg-muted/10 text-muted-foreground"
                    )}
                >
                    <span>
                        WhatsApp credits: <b className="text-foreground">{summary.whatsapp_balance.toLocaleString()}</b>
                        {" · "}{summary.free_whatsapp_remaining} free today
                        {shortBy > 0 && ` · ${shortBy.toLocaleString()} more needed for this send`}
                    </span>
                    {(needsPayment || shortBy > 0) && (
                        <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                            <Link to="/sms-tp?redeem=whatsapp">Buy WhatsApp credits</Link>
                        </Button>
                    )}
                </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10px] text-muted-foreground">
                <span>
                    {selected?.provider === "sandbox"
                        ? "Sandbox number: messages are simulated and not delivered."
                        : selected
                            ? `Sent gradually to protect your number. ${remainingToday} of ${selected.daily_limit} left today; extra messages wait for tomorrow.`
                            : ""}
                </span>
                <span className={cn(tooLong && "text-rose-500 font-semibold")}>
                    {composed.length.toLocaleString()} / {limit.toLocaleString()}
                    {rich.image_url && " (caption)"}
                </span>
            </div>

            {onMessageChange && canUseTemplates && (
                <WhatsAppTemplateGallery
                    open={galleryOpen}
                    onOpenChange={setGalleryOpen}
                    onUse={(template) => {
                        onMessageChange(template.body);
                        setRich(template.rich);
                        setBannerQuery(template.rich.image_url ? undefined : template.imageQuery);
                        autoBannerFor.current = undefined;
                        setShowEditor(true);
                    }}
                />
            )}
        </div>
    );
}
