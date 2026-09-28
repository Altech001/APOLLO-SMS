/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    apollosmsApi,
    WhatsAppAccountResponse,
    WhatsAppPairingResponse,
} from "@/api/apollosms";
import {
    apollosmsQueryKeys,
    useConnectWhatsApp,
    useDisconnectWhatsApp,
    usePairWhatsApp,
    useReconnectWhatsApp,
    useWhatsAppAccounts,
} from "@/api/apollosms-hooks";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WhatsAppGroupsPanel } from "@/components/whatsapp/WhatsAppGroupsPanel";
import { cn } from "@/lib/utils";
import { CheckCircle2, History, Link2, Loader2, MessageCircle, Plus, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const EMPTY_CONNECT_FORM = {
    display_name: "",
    phone_number: "",
    use_pairing_code: false,
};

const STATUS_STYLES: Record<string, string> = {
    connected: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    disconnected: "bg-muted text-muted-foreground",
    logged_out: "bg-rose-500/15 text-rose-600",
    banned: "bg-rose-500/15 text-rose-600",
};

const STATUS_LABELS: Record<string, string> = {
    connected: "online",
    pending: "waiting for scan",
    disconnected: "offline",
    logged_out: "logged out",
    banned: "temporarily banned",
};

export default function WhatsappMsgIndex() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: any) => {
            setSidebarCollapsed(e.detail.collapsed);
        };
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    const queryClient = useQueryClient();

    // Accounts are cached across visits and poll themselves while messages are queued.
    const accountsQuery = useWhatsAppAccounts();
    const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
    const isLoading = accountsQuery.isLoading;
    const refreshAccounts = () => queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.whatsappAccounts, exact: true });

    const connectMutation = useConnectWhatsApp();
    const pairMutation = usePairWhatsApp();
    const reconnectMutation = useReconnectWhatsApp();
    const disconnectMutation = useDisconnectWhatsApp();
    const busyAccountId =
        [pairMutation, reconnectMutation, disconnectMutation].find((m) => m.isPending)?.variables?.toString() ?? null;

    // Linking state (inline card)
    const linkCardRef = useRef<HTMLDivElement>(null);
    const [connectForm, setConnectForm] = useState(EMPTY_CONNECT_FORM);
    const [pairing, setPairing] = useState<WhatsAppPairingResponse | null>(null);

    const totalQueued = accounts.reduce((sum, account) => sum + (account.queued || 0), 0);
    const onlineAccounts = useMemo(
        () => accounts.filter((account) => account.provider === "whatsmeow" && account.online),
        [accounts]
    );

    // Only surface load errors when there is nothing cached to show.
    useEffect(() => {
        if (accountsQuery.error && !accountsQuery.data) {
            toast.error(accountsQuery.error instanceof Error ? accountsQuery.error.message : "Unable to load WhatsApp data");
        }
    }, [accountsQuery.error, accountsQuery.data]);

    // Poll linking progress while a QR / pairing code is on screen.
    const pairingAccountId = pairing?.account.id;
    const pairingStatus = pairing?.status;
    useEffect(() => {
        if (!pairingAccountId || pairingStatus !== "waiting") return;
        const timer = window.setInterval(async () => {
            try {
                const next = await apollosmsApi.whatsapp.pairing(pairingAccountId);
                setPairing(next);
                if (next.status === "success") {
                    toast.success(`WhatsApp linked${next.account.phone_number ? `: +${next.account.phone_number}` : ""}`);
                    queryClient.invalidateQueries({ queryKey: apollosmsQueryKeys.whatsappAccounts, exact: true });
                }
            } catch {
                // keep polling; transient errors are expected while the phone links
            }
        }, 2000);
        return () => window.clearInterval(timer);
    }, [pairingAccountId, pairingStatus, queryClient]);

    const updateConnectForm = <K extends keyof typeof EMPTY_CONNECT_FORM>(field: K, value: (typeof EMPTY_CONNECT_FORM)[K]) => {
        setConnectForm((prev) => ({ ...prev, [field]: value }));
    };

    const focusLinkCard = () => {
        linkCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const startNewLink = () => {
        setPairing(null);
        setConnectForm(EMPTY_CONNECT_FORM);
        focusLinkCard();
    };

    const handleConnect = (e: React.FormEvent) => {
        e.preventDefault();
        if (connectForm.use_pairing_code && !connectForm.phone_number.trim()) {
            toast.error("Enter the WhatsApp number to get a pairing code");
            return;
        }

        connectMutation.mutate(
            {
                provider: "whatsmeow",
                display_name: connectForm.display_name,
                phone_number: connectForm.use_pairing_code ? connectForm.phone_number : undefined,
            },
            {
                onSuccess: setPairing,
                onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to link WhatsApp number"),
            }
        );
    };

    const handleRelink = (account: WhatsAppAccountResponse) => {
        pairMutation.mutate(String(account.id), {
            onSuccess: (result) => {
                setConnectForm({ ...EMPTY_CONNECT_FORM, display_name: account.display_name });
                setPairing(result);
                focusLinkCard();
            },
            onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to start linking"),
        });
    };

    const handleReconnect = (id: string) => {
        reconnectMutation.mutate(id, {
            onSuccess: () => toast.success("Reconnecting to WhatsApp..."),
            onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to reconnect"),
        });
    };

    const handleDisconnect = (id: string) => {
        if (!window.confirm("Disconnect this number? It will be logged out from WhatsApp and queued messages are cancelled.")) return;
        disconnectMutation.mutate(id, {
            onSuccess: () => {
                toast.success("WhatsApp number disconnected");
                setPairing((current) => (String(current?.account.id) === id ? null : current));
            },
            onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to disconnect WhatsApp number"),
        });
    };

    return (
        <div
            className={cn(
                "min-h-screen bg-background transition-all duration-300",
                sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]"
            )}
        >
            <SEO title="WhatsApp Connector" />
            <AppHeader onCreateForm={() => { }} />

            <main className="max-w-8xl mx-auto px-4 sm:px-6 py-6 space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-base tracking-tight text-foreground sm:text-lg">WhatsApp Connector</h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <WhatsAppGroupsPanel accounts={onlineAccounts} />
                        <Button asChild variant="outline" size="sm" className="h-10 text-xs gap-1.5">
                            <Link to="/recents-sms?tab=whatsapp">
                                <History className="w-3.5 h-3.5" />
                                History & queue{totalQueued > 0 ? ` (${totalQueued} queued)` : ""}
                            </Link>
                        </Button>
                        <Button onClick={refreshAccounts} variant="outline" size="sm" className="h-10 text-xs gap-1.5" disabled={accountsQuery.isFetching}>
                            <RefreshCw className={cn("w-3.5 h-3.5", accountsQuery.isFetching && "animate-spin")} />
                            Refresh
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    {/* Linked numbers */}
                    <Card className="lg:col-span-1 border-border/10 shadow-sm rounded-none flex flex-col min-h-[480px]">
                        <CardHeader className="pb-3 border-b border-border/10 flex flex-row items-center justify-between space-y-0">
                            <div>
                                <CardTitle className="text-sm">Linked Numbers ({accounts.length})</CardTitle>
                                <CardDescription className="text-[10px] mt-0.5">Each number runs its own WhatsApp session</CardDescription>
                            </div>
                            <Button onClick={startNewLink} size="sm" className="h-10 text-xs gap-1.5">
                                <Plus className="w-3.5 h-3.5" />
                                Link Number
                            </Button>
                        </CardHeader>
                        <CardContent className="flex-1 p-4 overflow-y-auto max-h-[560px]">
                            {accounts.length === 0 ? (
                                <div className="h-64 border border-dashed border-border/80 rounded flex flex-col items-center justify-center text-center p-4">
                                    <div className="p-3 bg-emerald-500/10 rounded-full text-emerald-600 mb-2">
                                        <MessageCircle className="w-6 h-6" />
                                    </div>
                                    <p className="text-xs text-foreground">{isLoading ? "Loading numbers..." : "No WhatsApp number linked"}</p>
                                    <p className="text-[10px] text-muted-foreground mt-1 max-w-[220px]">
                                        Link your number from WhatsApp → Linked devices using the form on the right.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {accounts.map((account) => {
                                        const id = String(account.id);
                                        const isWhatsmeow = account.provider === "whatsmeow";
                                        const needsRelink = isWhatsmeow && (account.status === "logged_out" || account.status === "pending");
                                        const canReconnect = isWhatsmeow && !account.online && (account.status === "disconnected" || account.status === "connected");
                                        const statusKey = account.online ? "connected" : account.status === "connected" ? "disconnected" : account.status;
                                        return (
                                            <div key={id} className="p-3 rounded border border-border/50 space-y-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="text-xs text-foreground truncate">
                                                            {account.display_name || account.push_name || "WhatsApp number"}
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                                            {account.phone_number ? `+${account.phone_number}` : "Not linked yet"}
                                                        </p>
                                                    </div>
                                                    <span className={cn("text-[9px] uppercase px-1.5 py-0.5 rounded shrink-0", STATUS_STYLES[statusKey] || STATUS_STYLES.disconnected)}>
                                                        {STATUS_LABELS[statusKey] || statusKey}
                                                    </span>
                                                </div>

                                                {isWhatsmeow && account.linked_at && (
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                                            <span>Today: {account.sent_today} / {account.daily_limit}</span>
                                                            {account.queued > 0 && (
                                                                <Link to="/recents-sms?tab=whatsapp" className="text-emerald-600 hover:underline font-semibold">
                                                                    {account.queued} queued →
                                                                </Link>
                                                            )}
                                                        </div>
                                                        <div className="h-1 rounded bg-muted overflow-hidden">
                                                            <div
                                                                className="h-full bg-emerald-500"
                                                                style={{ width: `${Math.min(100, (account.sent_today / Math.max(1, account.daily_limit)) * 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {account.banned_until && account.status === "banned" && (
                                                    <p className="text-[10px] text-rose-500">
                                                        Sending paused until {new Date(account.banned_until).toLocaleString()}.
                                                    </p>
                                                )}
                                                {account.last_error && account.status !== "connected" && (
                                                    <p className="text-[10px] text-rose-500 break-words">{account.last_error}</p>
                                                )}

                                                <div className="flex justify-end gap-1.5">
                                                    {needsRelink && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-[11px] gap-1"
                                                            disabled={busyAccountId === id}
                                                            onClick={() => handleRelink(account)}
                                                        >
                                                            <Link2 className="w-3 h-3" />
                                                            Link again
                                                        </Button>
                                                    )}
                                                    {canReconnect && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-[11px] gap-1"
                                                            disabled={busyAccountId === id}
                                                            onClick={() => handleReconnect(id)}
                                                        >
                                                            <RotateCw className="w-3 h-3" />
                                                            Reconnect
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 text-[11px] gap-1 text-rose-500"
                                                        disabled={busyAccountId === id}
                                                        onClick={() => handleDisconnect(id)}
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                        Disconnect
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="lg:col-span-2 space-y-6">
                        {/* Link a number */}
                        <div ref={linkCardRef} className="scroll-mt-20">
                            <Card className="border-border/20 rounded shadow-sm">
                                <CardHeader className="pb-3 border-b border-border/10">
                                    <CardTitle className="text-sm flex items-center gap-1.5">
                                        <MessageCircle className="w-4 h-4 text-emerald-600" />
                                        Link a WhatsApp number
                                    </CardTitle>
                                    <CardDescription className="text-[10px] mt-0.5">
                                        Connects as a linked device, like WhatsApp Web. Your phone keeps working as normal.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-5">
                                    {pairing ? (
                                        <PairingView
                                            pairing={pairing}
                                            busy={busyAccountId === String(pairing.account.id)}
                                            onRetry={() => handleRelink(pairing.account)}
                                            onDone={startNewLink}
                                        />
                                    ) : (
                                        <form onSubmit={handleConnect} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div className="space-y-4">
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="wa-name" className="text-xs font-semibold">Display name (optional)</Label>
                                                    <Input
                                                        id="wa-name"
                                                        value={connectForm.display_name}
                                                        onChange={(e) => updateConnectForm("display_name", e.target.value)}
                                                        placeholder="e.g. Luco Support"
                                                        className="h-9 text-xs"
                                                    />
                                                </div>
                                                <label className="flex items-start gap-2 text-xs cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={connectForm.use_pairing_code}
                                                        onChange={(e) => updateConnectForm("use_pairing_code", e.target.checked)}
                                                        className="mt-0.5"
                                                    />
                                                    <span>
                                                        Also give me a pairing code
                                                        <span className="block text-[10px] text-muted-foreground">Useful when you're on the same phone and can't scan a QR code.</span>
                                                    </span>
                                                </label>
                                                {connectForm.use_pairing_code && (
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="wa-phone" className="text-xs font-semibold">WhatsApp number</Label>
                                                        <Input
                                                            id="wa-phone"
                                                            value={connectForm.phone_number}
                                                            onChange={(e) => updateConnectForm("phone_number", e.target.value)}
                                                            placeholder="0700000000 or +256700000000"
                                                            className="h-9 text-xs font-mono"
                                                        />
                                                    </div>
                                                )}
                                                <Button type="submit" className="h-10 text-xs font-semibold w-full sm:w-auto" disabled={connectMutation.isPending}>
                                                    {connectMutation.isPending ? "Starting..." : "Show QR Code"}
                                                </Button>
                                            </div>
                                            <div className="p-3 bg-amber-500/20 border border-amber-500/50 rounded text-xs leading-normal space-y-1 h-fit">
                                                <p className="text-foreground">Keeping your number safe:</p>
                                                <ul className="list-disc pl-4 space-y-0.5">
                                                    <li>Only message people who expect to hear from you. Spam reports are the main reason numbers get banned.</li>
                                                    <li>Messages are sent one at a time with pauses, and new numbers have a lower daily limit for their first week.</li>
                                                    {/* <li>This isn't WhatsApp's official Business API, so a ban is still possible. Consider using a dedicated number.</li> */}
                                                </ul>
                                            </div>
                                        </form>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

function PairingView({ pairing, busy, onRetry, onDone }: {
    pairing: WhatsAppPairingResponse;
    busy: boolean;
    onRetry: () => void;
    onDone: () => void;
}) {
    if (pairing.status === "success") {
        return (
            <div className="text-center space-y-3 py-6">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="text-sm">Linked successfully</p>
                <p className="text-xs text-muted-foreground">
                    {pairing.account.phone_number ? `+${pairing.account.phone_number} is ready to send.` : "Your number is ready to send."}
                    {" "}You can now import its groups from <b className="text-foreground">WhatsApp groups</b> at the top.
                </p>
                <Button onClick={onDone} size="sm" variant="outline" className="h-9 text-xs">Link another number</Button>
            </div>
        );
    }

    if (pairing.status === "waiting") {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="space-y-4">
                    <ol className="text-xs space-y-1.5 list-decimal pl-4 text-muted-foreground">
                        <li>Open WhatsApp on the phone with this number.</li>
                        <li>Go to <b className="text-foreground">Settings → Linked devices → Link a device</b>.</li>
                        <li>
                            {pairing.pairing_code
                                ? <>Tap <b className="text-foreground">Link with phone number instead</b> and enter the code, or scan the QR.</>
                                : "Scan the QR code."}
                        </li>
                    </ol>
                    {pairing.pairing_code && (
                        <div className="text-center p-3 rounded border border-emerald-500/40 bg-emerald-500/5">
                            <p className="text-[10px] uppercase text-muted-foreground">Pairing code</p>
                            <p className="text-2xl font-mono tracking-[0.3em] mt-1">
                                {pairing.pairing_code.slice(0, 4)}-{pairing.pairing_code.slice(4)}
                            </p>
                        </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">The code refreshes automatically. Keep this page open until linking finishes.</p>
                </div>
                <div className="flex justify-center">
                    {pairing.qr_code ? (
                        <div className="p-3 bg-white rounded">
                            <QRCodeSVG value={pairing.qr_code} size={220} level="L" />
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground py-16 flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Generating QR code...
                        </p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="text-center space-y-3 py-6">
            <p className="text-sm text-rose-500">{pairing.status === "timeout" ? "QR code expired" : "Linking failed"}</p>
            <p className="text-xs text-muted-foreground">{pairing.error}</p>
            <div className="flex justify-center gap-2">
                <Button onClick={onRetry} size="sm" className="h-9 text-xs" disabled={busy}>Try again</Button>
                <Button onClick={onDone} size="sm" variant="outline" className="h-9 text-xs">Cancel</Button>
            </div>
        </div>
    );
}
