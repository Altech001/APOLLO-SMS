import {
    AIChatAction,
    AIImageAspect,
    AIImageResponse,
    apollosmsApi,
    StockPhoto,
    ApiError,
    BillingSummary,
    ContactGroupResponse,
    ContactResponse,
    MessageChannel,
    WhatsAppAccountResponse,
    WhatsAppRich,
} from "@/api/apollosms";
import { apollosmsQueryKeys } from "@/api/apollosms-hooks";
import { Button } from "@/components/ui/button";
import WhatsAppComposer from "@/components/whatsapp/WhatsAppComposer";
import WhatsAppPreview from "@/components/whatsapp/WhatsAppPreview";
import WhatsAppRichEditor from "@/components/whatsapp/WhatsAppRichEditor";
import { buttonProblem, isRichEmpty } from "@/components/whatsapp/whatsapp-rich";
import { notifyBillingChange } from "@/hooks/use-billing-summary";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Download, ExternalLink, FileSpreadsheet, FileText, ImageIcon, Images, Link2, Loader2, MessageCircle, MessageCircleMore, MessageSquare, Pencil, Plus, RefreshCw, Save, Search, Send, Sparkles, Users, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
    ChatFile,
    estimateCost,
    fillTemplate,
    formatUGX,
    guessPhoneColumn,
    looksLikePhone,
    resolveGroups,
    resolveRecipient,
    ResolvedRecipient,
    smsParts,
    topUpPath,
} from "./chat-utils";

export type ChatActionStatus = "pending" | "done" | "dismissed";

/** An action proposed by the assistant, plus what the user did with it. */
export interface ChatActionState extends AIChatAction {
    status?: ChatActionStatus;
    /** Outcome shown once the action ran, e.g. "Sent 120, 3 failed". */
    result?: string;
    image?: AIImageResponse;
    stock?: { query: string; photos: StockPhoto[]; page: number; hasMore: boolean; selectedId?: number };
    note?: string;
}

export interface ChatActionContext {
    contacts: ContactResponse[];
    groups: ContactGroupResponse[];
    /** Spreadsheets attached in this chat, by file name. */
    files: ChatFile[];
    summary: BillingSummary | null;
}

const TEMPLATE_CATEGORIES = ["Authentication", "Marketing", "Transactional", "Alert"];
const BATCH_CHUNK = 200;

interface ChatActionCardProps extends ChatActionContext {
    action: ChatActionState;
    onChange: (next: ChatActionState) => void;
}

export default function ChatActionCard({ action, onChange, ...context }: ChatActionCardProps) {
    const status = action.status || "pending";
    switch (action.type) {
        case "create_template":
            return <TemplateCard action={action} status={status} onChange={onChange} />;
        case "generate_image":
            return <ImageCard action={action} onChange={onChange} allowAI={!!context.summary?.features?.ai_images} />;
        case "send_personalized":
        case "send_from_file":
            return <BatchCard action={action} status={status} context={context} onChange={onChange} />;
        default:
            return <SendCard action={action} status={status} context={context} onChange={onChange} />;
    }
}

type Tone = "sms" | "whatsapp" | "template";

function CardShell({ icon, title, tone, status, result, children }: {
    icon: React.ReactNode;
    title: string;
    tone: Tone;
    status: ChatActionStatus;
    result?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "rounded border  overflow-hidden",
                tone === "whatsapp" && "border-emerald-500/30",
                tone === "sms" && "border-primary/30",
                tone === "template" && "border-amber-500/30",
                status === "dismissed" && "opacity-60"
            )}
        >
            <div
                className={cn(
                    "flex items-center justify-between gap-2 px-4 py-2.5 border-b text-xs font-semibold",
                    tone === "whatsapp" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
                    tone === "sms" && "bg-primary/10 text-primary border-primary/20",
                    tone === "template" && "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                )}
            >
                <span className="flex items-center gap-2">{icon}{title}</span>
                {status === "done" && (
                    <span className="flex items-center gap-1 text-[11px]"><Check className="w-3.5 h-3.5" />{result || "Done"}</span>
                )}
                {status === "dismissed" && <span className="text-[11px] text-muted-foreground">Dismissed</span>}
            </div>
            <div className="p-4 space-y-3">{children}</div>
        </div>
    );
}

/** Cost of a send in credits and UGX, with a top-up shortcut when the balance is short. */
function CostLine({ channel, messages, summary }: { channel: MessageChannel; messages: string[]; summary: BillingSummary | null }) {
    const estimate = estimateCost(channel, messages, summary);
    if (!estimate || !summary) return null;
    const balance = channel === "sms" ? summary.sms_balance : summary.whatsapp_balance;
    const short = estimate.shortUnits > 0;
    return (
        <div
            className={cn(
                "flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border px-3 py-2 text-[11px]",
                short ? "border-rose-500/40 bg-rose-500/5 text-rose-600" : "border-border/60 bg-muted/20 text-muted-foreground"
            )}
        >
            <span className="flex items-start gap-1.5">
                <Wallet className="w-3.5 h-3.5 mt-px shrink-0" />
                <span>
                    Cost: <b className="text-foreground">{estimate.units.toLocaleString()} {estimate.unitLabel}{estimate.units === 1 ? "" : "s"}</b>
                    {estimate.freeUnits > 0 && ` (${estimate.freeUnits.toLocaleString()} free today)`}
                    {" ≈ "}<b className="text-foreground">{formatUGX(estimate.costUGX)}</b>
                    {" · "}Balance: {balance.toLocaleString()}
                    {short && <> · <b>short by {estimate.shortUnits.toLocaleString()} ({formatUGX(estimate.shortUGX)})</b></>}
                </span>
            </span>
            {short && (
                <Button asChild size="sm" variant="outline" className="h-7 text-[11px] shrink-0">
                    <Link to={topUpPath(channel)}>Top up {formatUGX(estimate.shortUGX)}</Link>
                </Button>
            )}
        </div>
    );
}

function RecipientChip({ recipient, onRemove }: { recipient: ResolvedRecipient; onRemove?: () => void }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]",
                recipient.phone ? "bg-muted/40 border-border" : "bg-rose-500/10 border-rose-500/40 text-rose-600"
            )}
            title={recipient.phone ? undefined : "No contact with this name; type the phone number instead"}
        >
            {recipient.name ? <><b className="font-semibold">{recipient.name}</b> {recipient.phone}</> : recipient.label}
            {!recipient.phone && " · not found"}
            {onRemove && (
                <button type="button" onClick={onRemove} className="ml-0.5 text-muted-foreground hover:text-foreground" aria-label={`Remove ${recipient.label}`}>
                    <X className="w-3 h-3" />
                </button>
            )}
        </span>
    );
}

function SendCard({ action, status, context, onChange }: {
    action: ChatActionState;
    status: ChatActionStatus;
    context: ChatActionContext;
    onChange: (next: ChatActionState) => void;
}) {
    const isWhatsApp = action.type === "send_whatsapp";
    const channel: MessageChannel = isWhatsApp ? "whatsapp" : "sms";
    const [message, setMessage] = useState(action.message || "");
    const [recipients, setRecipients] = useState<string[]>(action.recipients || []);
    const [groupNames, setGroupNames] = useState<string[]>(action.groups || []);
    const [draftRecipient, setDraftRecipient] = useState("");
    const [isSending, setIsSending] = useState(false);
    const editable = status === "pending";

    const resolved = useMemo(() => recipients.map((r) => resolveRecipient(r, context.contacts)), [recipients, context.contacts]);
    const fromGroups = useMemo(() => resolveGroups(groupNames, context.groups, context.contacts), [groupNames, context.groups, context.contacts]);
    const phones = useMemo(
        () => [...new Set([...resolved, ...fromGroups.members].map((r) => r.phone).filter(Boolean) as string[])],
        [resolved, fromGroups]
    );
    const unresolved = resolved.filter((r) => !r.phone);

    const addRecipient = () => {
        const values = draftRecipient.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean);
        if (values.length) setRecipients((current) => [...current, ...values.filter((v) => !current.includes(v))]);
        setDraftRecipient("");
    };

    const finish = (result: string) => onChange({ ...action, message, recipients, groups: groupNames, status: "done", result });

    const sendSms = async () => {
        if (!phones.length) return toast.error("Add at least one recipient with a phone number");
        if (!message.trim()) return toast.error("The message is empty");
        setIsSending(true);
        try {
            const res = await apollosmsApi.sms.send({ phones, message: message.trim() });
            toast.success(res.message || `SMS queued for ${phones.length} recipient${phones.length === 1 ? "" : "s"}`);
            notifyBillingChange();
            finish(`Queued for ${phones.length}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to send SMS");
        } finally {
            setIsSending(false);
        }
    };

    const parts = smsParts(message);

    return (
        <CardShell
            tone={channel}
            status={status}
            result={action.result}
            icon={isWhatsApp ? <MessageCircle className="w-4 h-4" /> : <MessageCircleMore className="w-4 h-4" />}
            title={isWhatsApp ? "Send WhatsApp message" : "Send SMS"}
        >
            <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                    To {phones.length > 0 && <span className="font-normal">· {phones.length.toLocaleString()} number{phones.length === 1 ? "" : "s"}</span>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {groupNames.map((name) => {
                        const known = !fromGroups.unknown.includes(name);
                        const count = known ? resolveGroups([name], context.groups, context.contacts).members.length : 0;
                        return (
                            <span
                                key={name}
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]",
                                    known ? "bg-primary/10 border-primary/30 text-primary" : "bg-rose-500/10 border-rose-500/40 text-rose-600"
                                )}
                            >
                                <Users className="w-3 h-3" />
                                <b className="font-semibold">{name}</b> {known ? `· ${count} contacts` : "· group not found"}
                                {editable && (
                                    <button type="button" onClick={() => setGroupNames((g) => g.filter((n) => n !== name))} className="ml-0.5 hover:text-foreground" aria-label={`Remove group ${name}`}>
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </span>
                        );
                    })}
                    {resolved.map((r, i) => (
                        <RecipientChip
                            key={`${r.label}-${i}`}
                            recipient={r}
                            onRemove={editable ? () => setRecipients((current) => current.filter((_, idx) => idx !== i)) : undefined}
                        />
                    ))}
                    {editable && (
                        <span className="inline-flex items-center gap-1">
                            <input
                                value={draftRecipient}
                                onChange={(e) => setDraftRecipient(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addRecipient();
                                    }
                                }}
                                onBlur={addRecipient}
                                placeholder={phones.length ? "Add number or name" : "Phone number or contact name"}
                                className="h-7 w-48 rounded-full border border-dashed border-border bg-transparent px-3 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                            <button type="button" onClick={addRecipient} className="text-muted-foreground hover:text-foreground" aria-label="Add recipient">
                                <Plus className="w-4 h-4" />
                            </button>
                        </span>
                    )}
                </div>
                {unresolved.length > 0 && editable && (
                    <p className="text-[11px] text-rose-600 mt-1.5">
                        {unresolved.length} recipient{unresolved.length === 1 ? "" : "s"} could not be matched to a contact and will be skipped.
                    </p>
                )}
            </div>

            <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Message</p>
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={!editable}
                    rows={Math.min(8, Math.max(3, message.split("\n").length + 1))}
                    className="w-full rounded border border-border bg-muted/20 p-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-80"
                />
                {!isWhatsApp && (
                    <p className="text-[11px] text-muted-foreground text-right">
                        {message.length} characters · {parts} SMS part{parts === 1 ? "" : "s"} per recipient
                    </p>
                )}
            </div>

            {editable && <CostLine channel={channel} messages={phones.map(() => message)} summary={context.summary} />}

            {editable && isWhatsApp && (
                <WhatsAppComposer
                    message={message}
                    onMessageChange={setMessage}
                    recipients={phones}
                    initialRich={richFromAction(action)}
                    imageQuery={action.image_query}
                    onSent={(r) => finish(`Sent ${r.sent + r.queued}${r.failed ? `, ${r.failed} failed` : ""}`)}
                />
            )}

            {editable && (
                <div className="flex items-center justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...action, status: "dismissed" })}>
                        Dismiss
                    </Button>
                    {!isWhatsApp && (
                        <Button type="button" size="sm" onClick={sendSms} disabled={isSending || !phones.length || !message.trim()} className="gap-1.5">
                            {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            Send SMS ({phones.length.toLocaleString()})
                        </Button>
                    )}
                </div>
            )}
        </CardShell>
    );
}

interface BatchRow {
    to: string;
    phone?: string;
    message: string;
    problem?: string;
}

/** A different message per recipient: written by the AI, or mail-merged from an attached spreadsheet. */
function BatchCard({ action, status, context, onChange }: {
    action: ChatActionState;
    status: ChatActionStatus;
    context: ChatActionContext;
    onChange: (next: ChatActionState) => void;
}) {
    const fromFile = action.type === "send_from_file";
    const [channel, setChannel] = useState<MessageChannel>(action.channel || "sms");
    const [template, setTemplate] = useState(action.message || "");
    const [rich, setRich] = useState<WhatsAppRich>(() => richFromAction(action) || {});
    const [showRich, setShowRich] = useState(false);
    useAutoBanner(action.image_query, rich, setRich);
    const [items, setItems] = useState(action.items || []);
    const [accountId, setAccountId] = useState("");
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [paymentError, setPaymentError] = useState("");
    const editable = status === "pending";

    const file = useMemo(() => {
        const spreadsheets = context.files.filter((f) => f.kind === "spreadsheet");
        const wanted = action.attachment?.trim().toLowerCase();
        return spreadsheets.find((f) => f.name.toLowerCase() === wanted) || (spreadsheets.length === 1 ? spreadsheets[0] : undefined);
    }, [context.files, action.attachment]);
    const [phoneColumn, setPhoneColumn] = useState<string | undefined>(undefined);
    const column = phoneColumn ?? (file?.columns && file.rows ? guessPhoneColumn(file.columns, file.rows, action.phone_column) : undefined);

    const rows: BatchRow[] = useMemo(() => {
        if (!fromFile) {
            return items.map((item) => {
                const r = resolveRecipient(item.to, context.contacts);
                return { to: r.name ? `${r.name} (${r.phone})` : item.to, phone: r.phone, message: item.message, problem: r.phone ? undefined : "no phone number" };
            });
        }
        if (!file?.rows || !column) return [];
        return file.rows.map((row) => {
            const raw = row[column] || "";
            const { text, missing } = fillTemplate(template, row);
            const problem = !looksLikePhone(raw) ? "no phone number" : missing.length ? `unknown {${missing.join("}, {")}}` : undefined;
            return { to: raw || "—", phone: looksLikePhone(raw) ? raw : undefined, message: text, problem };
        });
    }, [fromFile, items, context.contacts, file, column, template]);

    const ready = rows.filter((r) => !r.problem);
    const skipped = rows.length - ready.length;

    const { data: accounts = [] } = useQuery<WhatsAppAccountResponse[]>({
        queryKey: ["apollosms", "whatsapp", "accounts", "online"],
        queryFn: async () => (await apollosmsApi.whatsapp.accounts()).filter((a) => a.online),
        enabled: channel === "whatsapp" && editable,
    });
    const account = accounts.find((a) => String(a.id) === accountId) || accounts[0];

    const isWhatsAppChannel = channel === "whatsapp";

    const send = async () => {
        if (!ready.length) return toast.error("No messages are ready to send");
        const buttonIssue = isWhatsAppChannel ? (rich.buttons || []).map(buttonProblem).find(Boolean) : null;
        if (buttonIssue) return toast.error(`Fix the buttons first: ${buttonIssue}`);
        if (channel === "whatsapp" && !account) return toast.error("Link a WhatsApp number first");
        setPaymentError("");
        setProgress({ done: 0, total: ready.length });
        let accepted = 0;
        let failed = 0;
        const errors: string[] = [];
        try {
            for (let start = 0; start < ready.length; start += BATCH_CHUNK) {
                const chunk = ready.slice(start, start + BATCH_CHUNK);
                const res = await apollosmsApi.ai.sendBatch({
                    channel,
                    account_id: account?.id,
                    items: chunk.map((r) => ({ phone: r.phone as string, message: r.message })),
                    ...(channel === "whatsapp" ? rich : {}),
                });
                accepted += res.accepted;
                failed += res.failed;
                errors.push(...res.errors);
                setProgress({ done: Math.min(start + chunk.length, ready.length), total: ready.length });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to send";
            if (error instanceof ApiError && error.status === 402) setPaymentError(message);
            toast.error(message);
            if (accepted === 0) {
                setProgress(null);
                return;
            }
        } finally {
            notifyBillingChange();
        }
        setProgress(null);
        const result = `Sent ${accepted.toLocaleString()}${failed ? `, ${failed} failed` : ""}`;
        if (failed || errors.length) toast.warning(`${result}. ${errors[0] || ""}`);
        else toast.success(`${result} ${channel === "sms" ? "SMS" : "WhatsApp messages"}`);
        onChange({ ...action, channel, message: template, items, phone_column: column, status: "done", result });
    };

    const preview = rows.slice(0, 8);
    const isWhatsApp = channel === "whatsapp";
    const fieldClass = "h-8 rounded border border-border bg-muted/20 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40";

    return (
        <CardShell
            tone={channel}
            status={status}
            result={action.result}
            icon={fromFile ? <FileSpreadsheet className="w-4 h-4" /> : <Users className="w-4 h-4" />}
            title={fromFile ? `Send from ${action.attachment || "file"}` : "Send personalised messages"}
        >
            {fromFile && !file && (
                <div className="flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Attach {action.attachment ? <b>{action.attachment}</b> : "the spreadsheet"} again to send. Files are kept only while this page is open.
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-muted-foreground">Send via</span>
                <select value={channel} onChange={(e) => setChannel(e.target.value as MessageChannel)} disabled={!editable} className={fieldClass}>
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp</option>
                </select>
                {isWhatsApp && editable && (
                    accounts.length ? (
                        <select value={account ? String(account.id) : ""} onChange={(e) => setAccountId(e.target.value)} className={fieldClass}>
                            {accounts.map((a) => (
                                <option key={a.id} value={String(a.id)}>+{a.phone_number}{a.provider === "sandbox" ? " (sandbox)" : ""}</option>
                            ))}
                        </select>
                    ) : (
                        <Link to="/whatsapp" className="text-rose-600 underline">No WhatsApp number online, so link one first</Link>
                    )
                )}
                {fromFile && file?.columns && (
                    <>
                        <span className="font-semibold text-muted-foreground ml-1">Phone column</span>
                        <select value={column || ""} onChange={(e) => setPhoneColumn(e.target.value)} disabled={!editable} className={fieldClass}>
                            {!column && <option value="">Choose…</option>}
                            {file.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </>
                )}
            </div>

            {fromFile && (
                <div>
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                        Message template {file?.columns && <span className="font-normal">· columns: {file.columns.map((c) => `{${c}}`).join(" ")}</span>}
                    </p>
                    <textarea
                        value={template}
                        onChange={(e) => setTemplate(e.target.value)}
                        disabled={!editable}
                        rows={Math.min(8, Math.max(3, template.split("\n").length + 1))}
                        className="w-full rounded border border-border bg-muted/20 p-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-80"
                    />
                </div>
            )}

            {isWhatsAppChannel && editable && (
                <div className="space-y-2">
                    <Button type="button" variant={showRich ? "secondary" : "outline"} size="sm" onClick={() => setShowRich((v) => !v)} className="h-8 text-xs">
                        Banner & buttons{!isRichEmpty(rich) && " ✓"}
                    </Button>
                    {showRich && <WhatsAppRichEditor value={rich} onChange={setRich} imageQuery={action.image_query} className="rounded border border-border/60 p-3" />}
                    {ready[0] && <WhatsAppPreview message={ready[0].message} rich={rich} />}
                </div>
            )}

            {rows.length > 0 && (
                <div className="rounded border border-border/60 overflow-hidden">
                    <div className="overflow-x-auto max-h-80">
                        <table className="w-full text-xs">
                            <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                                <tr>
                                    <th className="text-left font-semibold px-3 py-2 w-40">To</th>
                                    <th className="text-left font-semibold px-3 py-2">Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.map((row, i) => (
                                    <tr key={i} className={cn("border-t border-border/40 align-top", row.problem && "bg-rose-500/5")}>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            {row.to}
                                            {row.problem && <div className="text-[10px] text-rose-600">{row.problem}, skipped</div>}
                                        </td>
                                        <td className="px-3 py-2">
                                            {!fromFile && editable ? (
                                                <textarea
                                                    value={row.message}
                                                    onChange={(e) => setItems((current) => current.map((it, idx) => (idx === i ? { ...it, message: e.target.value } : it)))}
                                                    rows={2}
                                                    className="w-full rounded border border-border/60 bg-transparent p-1.5 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-primary/40"
                                                />
                                            ) : (
                                                <span className="whitespace-pre-wrap break-words">{row.message}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex justify-between gap-2 px-3 py-2 border-t border-border/40 bg-muted/20 text-[11px] text-muted-foreground">
                        <span>
                            <b className="text-foreground">{ready.length.toLocaleString()}</b> ready
                            {skipped > 0 && <span className="text-rose-600"> · {skipped.toLocaleString()} skipped</span>}
                        </span>
                        {rows.length > preview.length && <span>Showing {preview.length} of {rows.length.toLocaleString()}</span>}
                    </div>
                </div>
            )}

            {editable && ready.length > 0 && (
                <CostLine channel={channel} messages={ready.map((r) => r.message)} summary={isWhatsApp && account?.provider === "sandbox" ? null : context.summary} />
            )}
            {paymentError && <p className="text-[11px] text-rose-600">{paymentError}</p>}

            {progress && (
                <div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Sending {progress.done.toLocaleString()} of {progress.total.toLocaleString()}…</p>
                </div>
            )}

            {editable && (
                <div className="flex items-center justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...action, status: "dismissed" })} disabled={!!progress}>
                        Dismiss
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={send}
                        disabled={!!progress || !ready.length || (isWhatsApp && !account)}
                        className={cn("gap-1.5", isWhatsApp && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                    >
                        {progress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Send {ready.length.toLocaleString()} {isWhatsApp ? "WhatsApp" : "SMS"}
                    </Button>
                </div>
            )}
        </CardShell>
    );
}

function TemplateCard({ action, status, onChange }: {
    action: ChatActionState;
    status: ChatActionStatus;
    onChange: (next: ChatActionState) => void;
}) {
    const queryClient = useQueryClient();
    const [name, setName] = useState(action.name || "");
    const [category, setCategory] = useState(action.category || "Transactional");
    const [channel, setChannel] = useState<MessageChannel>(action.channel || "whatsapp");
    const [content, setContent] = useState(action.content || "");
    const [rich, setRich] = useState<WhatsAppRich>(() => richFromAction(action) || {});
    useAutoBanner(action.image_query, rich, setRich);
    const [isSaving, setIsSaving] = useState(false);
    const editable = status === "pending";

    const save = async () => {
        if (!name.trim() || !content.trim()) return toast.error("Give the template a name and some content");
        setIsSaving(true);
        try {
            await apollosmsApi.smsTemplates.create({ name: name.trim(), category, channel, content: content.trim(), extras: channel === "whatsapp" ? rich : undefined });
            queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.templates });
            toast.success(`Template "${name.trim()}" saved`);
            onChange({ ...action, name, category, channel, content, status: "done", result: "Saved" });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save template");
        } finally {
            setIsSaving(false);
        }
    };

    const fieldClass = "h-9 rounded border border-border bg-muted/20 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-80";

    return (
        <CardShell tone="template" status={status} result={action.result} icon={<FileText className="w-4 h-4" />} title="Save template">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} placeholder="Template name" className={cn(fieldClass, "sm:col-span-3")} />
                <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={!editable} className={cn(fieldClass, "sm:col-span-2")}>
                    {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={channel} onChange={(e) => setChannel(e.target.value as MessageChannel)} disabled={!editable} className={fieldClass}>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                </select>
            </div>
            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={!editable}
                rows={Math.min(10, Math.max(4, content.split("\n").length + 1))}
                className="w-full rounded border border-border bg-muted/20 p-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-80"
            />
            {channel === "whatsapp" && (
                <>
                    {editable && <WhatsAppRichEditor value={rich} onChange={setRich} imageQuery={action.image_query} className="rounded border border-border/60 p-3" />}
                    <WhatsAppPreview message={content} rich={rich} />
                </>
            )}
            {editable && (
                <div className="flex items-center justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...action, status: "dismissed" })}>
                        Dismiss
                    </Button>
                    <Button type="button" size="sm" onClick={save} disabled={isSaving} className="gap-1.5">
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save template
                    </Button>
                </div>
            )}
        </CardShell>
    );
}

const ASPECT_CLASS: Record<AIImageAspect, string> = {
    square: "aspect-square max-w-md",
    landscape: "aspect-[16/9] max-w-xl",
    portrait: "aspect-[9/16] max-w-xs",
};

const fileSlug = (text: string) => text.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "image";

async function downloadImage(url: string, name: string) {
    try {
        const blob = await (await fetch(url)).blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = name;
        a.click();
        URL.revokeObjectURL(href);
    } catch {
        window.open(url, "_blank", "noopener");
    }
}

function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`), () => toast.error("Could not copy"));
}

function ImageCard({ action, onChange, allowAI }: { action: ChatActionState; onChange: (next: ChatActionState) => void; allowAI: boolean }) {
    return action.source === "ai" && allowAI
        ? <AIImageView action={action} onChange={onChange} />
        : <StockImageView action={action} onChange={onChange} allowAI={allowAI} />;
}

function StockImageView({ action, onChange, allowAI }: { action: ChatActionState; onChange: (next: ChatActionState) => void; allowAI: boolean }) {
    const aspect: AIImageAspect = action.aspect || "square";
    const [query, setQuery] = useState(action.stock?.query || action.query || action.prompt || "");
    const [isSearching, setIsSearching] = useState(false);
    const [editing, setEditing] = useState(false);
    const started = useRef(false);
    const stock = action.stock;
    const selected = stock?.photos.find((p) => p.id === stock.selectedId) || stock?.photos[0];

    const switchToAI = (note?: string) => {
        if (allowAI) return onChange({ ...action, source: "ai", note });
        onChange({ ...action, note: "No matching stock photos. Try other words." });
        setEditing(true);
    };

    const search = async (text = query, page = 1) => {
        if (text.trim().length < 2) return toast.error("Describe the photo you want");
        setIsSearching(true);
        try {
            const res = await apollosmsApi.ai.searchStock(text.trim(), aspect, page);
            if (page === 1 && res.photos.length === 0) {
                if (!stock) return switchToAI("No matching stock photos, so Apollo generated one with AI.");
                return toast.info("No photos found. Try other words.");
            }
            const photos = page === 1 ? res.photos : [...(stock?.photos || []), ...res.photos.filter((p) => !stock?.photos.some((q) => q.id === p.id))];
            onChange({
                ...action,
                status: "done",
                stock: { query: res.query, photos, page: res.page, hasMore: res.has_more, selectedId: page === 1 ? res.photos[0]?.id : stock?.selectedId },
            });
            setEditing(false);
        } catch {
            if (!stock) switchToAI("Stock photos weren't available, so Apollo generated one with AI.");
            else toast.error("Couldn't load more photos right now");
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        if (started.current || stock || action.status === "dismissed") return;
        started.current = true;
        search(action.query || action.prompt || "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const select = (id: number) => stock && onChange({ ...action, stock: { ...stock, selectedId: id } });

    return (
        <div className="space-y-2">
            <div
                className={cn("relative w-full overflow-hidden rounded border border-border bg-muted/30", ASPECT_CLASS[aspect])}
                style={selected ? { backgroundColor: selected.avg_color } : undefined}
            >
                {selected && <img src={selected.preview} alt={selected.alt || stock?.query} className="w-full h-full object-cover" />}
                {!selected && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-primary/10 via-muted/40 to-primary/5" />
                        <Images className={cn("relative w-7 h-7 text-primary", isSearching && "animate-pulse")} />
                        <p className="relative text-xs">{isSearching || !action.note ? "Finding photos…" : "No photo yet"}</p>
                    </div>
                )}
                {selected && (
                    <a
                        href={selected.page_url}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute left-2 bottom-2 max-w-[85%] truncate rounded-full bg-black/55 px-2.5 py-1 text-[10px] text-white backdrop-blur hover:bg-black/70"
                    >
                        Photo by {selected.photographer} on Pexels
                    </a>
                )}
            </div>

            {stock && stock.photos.length > 1 && (
                <ThumbnailStrip
                    photos={stock.photos}
                    selectedId={selected?.id}
                    onSelect={select}
                    hasMore={stock.hasMore}
                    loadingMore={isSearching}
                    onMore={() => search(stock.query, stock.page + 1)}
                />
            )}

            {action.note && <p className="text-[11px] text-muted-foreground">{action.note}</p>}

            {selected && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => downloadImage(selected.full, `pexels-${fileSlug(stock?.query || "photo")}-${selected.id}.jpg`)} className="h-8 text-xs gap-1.5">
                        <Download className="w-3.5 h-3.5" />
                        Download
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing((e) => !e)} disabled={isSearching} className="h-8 text-xs gap-1.5">
                        <Search className="w-3.5 h-3.5" />
                        Search again
                    </Button>
                    {allowAI && (
                        <Button type="button" size="sm" variant="outline" onClick={() => switchToAI()} className="h-8 text-xs gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            Generate with AI
                        </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => copyText(selected.full, "Image link")} className="h-8 text-xs gap-1.5">
                        <Link2 className="w-3.5 h-3.5" />
                        Copy link
                    </Button>
                </div>
            )}

            {editing && (
                <form
                    className="flex items-center gap-2 max-w-xl"
                    onSubmit={(e) => {
                        e.preventDefault();
                        search(query);
                    }}
                >
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="e.g. fresh orange juice glasses"
                        className="flex-1 h-8 rounded border border-border bg-muted/20 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <Button type="submit" size="sm" disabled={isSearching} className="h-8 text-xs gap-1.5">
                        {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                        Search
                    </Button>
                </form>
            )}
        </div>
    );
}

function ThumbnailStrip({ photos, selectedId, onSelect, hasMore, loadingMore, onMore }: {
    photos: StockPhoto[];
    selectedId?: number;
    onSelect: (id: number) => void;
    hasMore: boolean;
    loadingMore: boolean;
    onMore: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ left: false, right: false });

    const update = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    }, []);

    useEffect(() => {
        update();
        const el = ref.current;
        if (!el) return;
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => observer.disconnect();
    }, [update, photos.length]);

    const scroll = (direction: 1 | -1) => ref.current?.scrollBy({ left: direction * ref.current.clientWidth * 0.8, behavior: "smooth" });

    const arrow = "absolute top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/95 border border-border shadow-md flex items-center justify-center text-foreground hover:bg-muted transition-opacity";

    return (
        <div className="relative max-w-xl">
            <div ref={ref} onScroll={update} className="flex gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {photos.map((p) => (
                    <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelect(p.id)}
                        className={cn(
                            "shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-all",
                            p.id === selectedId ? "border-primary" : "border-transparent opacity-80 hover:opacity-100"
                        )}
                        style={{ backgroundColor: p.avg_color }}
                        aria-label={p.alt || "Stock photo"}
                    >
                        <img src={p.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </button>
                ))}
                {hasMore && (
                    <button
                        type="button"
                        onClick={onMore}
                        disabled={loadingMore}
                        className="shrink-0 w-14 h-14 rounded border border-dashed border-border text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted flex flex-col items-center justify-center gap-0.5"
                    >
                        {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        More
                    </button>
                )}
            </div>
            {edges.left && (
                <>
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent" />
                    <button type="button" onClick={() => scroll(-1)} className={cn(arrow, "left-1")} aria-label="Previous photos">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </>
            )}
            {edges.right && (
                <>
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
                    <button type="button" onClick={() => scroll(1)} className={cn(arrow, "right-1")} aria-label="More photos">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </>
            )}
        </div>
    );
}

function AIImageView({ action, onChange }: { action: ChatActionState; onChange: (next: ChatActionState) => void }) {
    const [prompt, setPrompt] = useState(action.image?.prompt || action.prompt || "");
    const [aspect, setAspect] = useState<AIImageAspect>(action.image?.aspect || action.aspect || "square");
    const [isDrawing, setIsDrawing] = useState(false);
    const [error, setError] = useState("");
    const [editing, setEditing] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const started = useRef(false);
    const image = action.image;

    const draw = async (nextPrompt = prompt, nextAspect = aspect) => {
        if (nextPrompt.trim().length < 3) return toast.error("Describe the image first");
        setIsDrawing(true);
        setError("");
        try {
            const res = await apollosmsApi.ai.generateImage({ prompt: nextPrompt.trim(), aspect: nextAspect });
            onChange({ ...action, source: "ai", prompt: nextPrompt.trim(), aspect: nextAspect, image: res, status: "done" });
            setEditing(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not draw the image");
        } finally {
            setIsDrawing(false);
        }
    };

    useEffect(() => {
        if (started.current || image || action.status === "dismissed") return;
        started.current = true;
        draw(action.prompt || action.query || "", action.aspect || "square");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!isDrawing) return;
        const t0 = Date.now();
        setElapsed(0);
        const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
        return () => window.clearInterval(timer);
    }, [isDrawing]);

    const shownAspect = image?.aspect || aspect;
    const fieldClass = "h-8 rounded border border-border bg-muted/20 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40";

    return (
        <div className="space-y-2">
            <div className={cn("relative w-full overflow-hidden rounded border border-border bg-muted/30", ASPECT_CLASS[shownAspect])}>
                {image && (
                    <a href={image.url} target="_blank" rel="noreferrer" title="Open full size">
                        <img src={image.url} alt={image.prompt} className={cn("w-full h-full object-cover transition-opacity", isDrawing && "opacity-40")} />
                    </a>
                )}
                {image && (
                    <span className="absolute left-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[10px] text-white backdrop-blur">
                        <Sparkles className="w-3 h-3" />
                        AI generated
                    </span>
                )}
                {isDrawing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        {!image && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-primary/10 via-muted/40 to-primary/5" />}
                        <ImageIcon className="relative w-7 h-7 animate-pulse text-primary" />
                        <p className="relative text-xs">Generating image… <span className="tabular-nums">{elapsed}s</span></p>
                    </div>
                )}
                {!image && !isDrawing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                        <AlertTriangle className="w-6 h-6 text-amber-500" />
                        <p className="text-xs text-muted-foreground">{error || "The image wasn't generated"}</p>
                        <Button type="button" size="sm" variant="outline" onClick={() => draw()} className="h-8 text-xs gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5" />
                            Try again
                        </Button>
                    </div>
                )}
            </div>
            {action.note && <p className="text-[11px] text-muted-foreground">{action.note}</p>}
            {error && image && <p className="text-[11px] text-muted-foreground">{error}</p>}

            <div className="flex flex-wrap items-center gap-1.5">
                {image && (
                    <>
                        <Button type="button" size="sm" variant="outline" onClick={() => downloadImage(image.url, `apollo-${fileSlug(prompt)}.${image.url.endsWith(".png") ? "png" : "jpg"}`)} disabled={isDrawing} className="h-8 text-xs gap-1.5">
                            <Download className="w-3.5 h-3.5" />
                            Download
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => draw()} disabled={isDrawing} className="h-8 text-xs gap-1.5">
                            <RefreshCw className={cn("w-3.5 h-3.5", isDrawing && "animate-spin")} />
                            Redraw
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditing((e) => !e)} disabled={isDrawing} className="h-8 text-xs gap-1.5">
                            <Pencil className="w-3.5 h-3.5" />
                            Edit prompt
                        </Button>
                    </>
                )}
                <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...action, source: "stock", note: undefined })} disabled={isDrawing} className="h-8 text-xs gap-1.5">
                    <Images className="w-3.5 h-3.5" />
                    Stock photos
                </Button>
                {image && (
                    <>
                        <Button type="button" size="sm" variant="ghost" onClick={() => copyText(image.url, "Image link")} className="h-8 text-xs gap-1.5">
                            <Link2 className="w-3.5 h-3.5" />
                            Copy link
                        </Button>
                        <Button type="button" size="sm" variant="ghost" asChild className="h-8 text-xs gap-1.5">
                            <a href={image.url} target="_blank" rel="noreferrer">
                                <ExternalLink className="w-3.5 h-3.5" />
                                Open
                            </a>
                        </Button>
                    </>
                )}
            </div>

            {(editing || (!image && !isDrawing)) && (
                <div className="rounded border border-border/60 bg-card p-3 space-y-2">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        className="w-full rounded border border-border bg-muted/20 p-2.5 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <div className="flex items-center justify-between gap-2">
                        <select value={aspect} onChange={(e) => setAspect(e.target.value as AIImageAspect)} className={fieldClass}>
                            <option value="square">Square (1:1)</option>
                            <option value="portrait">Portrait: flyer / status</option>
                            <option value="landscape">Landscape: banner</option>
                        </select>
                        <Button type="button" size="sm" onClick={() => draw()} disabled={isDrawing} className="h-8 text-xs gap-1.5">
                            {isDrawing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            Generate
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

function richFromAction(action: AIChatAction): WhatsAppRich | undefined {
    const rich: WhatsAppRich = { header: action.header, footer: action.footer, buttons: action.buttons };
    return isRichEmpty(rich) ? undefined : rich;
}

/** Picks the first stock photo for the assistant's banner keywords, once. */
function useAutoBanner(query: string | undefined, rich: WhatsAppRich, setRich: (update: (current: WhatsAppRich) => WhatsAppRich) => void) {
    const done = useRef(false);
    useEffect(() => {
        if (done.current || !query?.trim() || rich.image_url) return;
        done.current = true;
        apollosmsApi.ai
            .searchStock(query.trim(), "landscape")
            .then((res) => {
                const photo = res.photos[0];
                if (photo) setRich((current) => (current.image_url ? current : { ...current, image_url: photo.full }));
            })
            .catch(() => undefined);
    }, [query, rich.image_url, setRich]);
}
