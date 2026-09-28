import { AdminAdjustBalanceRequest, apollosmsApi, UserResponse } from "@/api/apollosms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2, MessageCircle, Minus, Plus, RefreshCw, Search, ShieldAlert, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

const usersQueryKey = ["apollosms", "admin-users"] as const;

type Filter = "all" | "verified" | "unverified" | "admin";

const FILTERS: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "All" },
    { id: "unverified", label: "Unverified" },
    { id: "verified", label: "Verified" },
    { id: "admin", label: "Admins" },
];

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function UsersAdminPage() {
    const queryClient = useQueryClient();
    const { data: users = [], isLoading, isFetching, refetch } = useQuery({
        queryKey: usersQueryKey,
        queryFn: () => apollosmsApi.users.list(),
    });
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [adjusting, setAdjusting] = useState<UserResponse | null>(null);

    const replaceUser = (updated: UserResponse) =>
        queryClient.setQueryData<UserResponse[]>(usersQueryKey, (current = []) =>
            current.map((u) => (String(u.id) === String(updated.id) ? { ...u, ...updated } : u))
        );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users
            .filter((u) => {
                if (filter === "verified" && !u.is_verified) return false;
                if (filter === "unverified" && u.is_verified) return false;
                if (filter === "admin" && u.role !== "admin") return false;
                if (!q) return true;
                return [u.name, u.email, u.phone].some((v) => v?.toLowerCase().includes(q));
            })
            .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    }, [users, search, filter]);

    const stats = useMemo(() => ({
        total: users.length,
        unverified: users.filter((u) => !u.is_verified).length,
        sms: users.reduce((sum, u) => sum + (u.sms_balance || 0), 0),
        whatsapp: users.reduce((sum, u) => sum + (u.whatsapp_balance || 0), 0),
    }), [users]);

    const toggleVerified = async (user: UserResponse) => {
        setBusyId(String(user.id));
        try {
            const updated = await apollosmsApi.users.setVerified(user.id, !user.is_verified);
            replaceUser(updated);
            toast.success(updated.is_verified ? `${user.name} is now verified` : `${user.name} is now unverified`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to update verification");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <SettingsLayout title="Users">
            <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-5">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-base font-bold text-foreground">Users</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">Verify accounts and credit or debit SMS and WhatsApp balances.</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 shrink-0" onClick={() => refetch()} disabled={isFetching}>
                        <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
                        <span className="hidden sm:inline">Refresh</span>
                    </Button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                    {[
                        { label: "Users", value: stats.total },
                        { label: "Unverified", value: stats.unverified },
                        { label: "SMS credits held", value: stats.sms },
                        { label: "WhatsApp credits held", value: stats.whatsapp },
                    ].map((s) => (
                        <div key={s.label} className="rounded border border-border/60 bg-card p-3">
                            <p className="text-[11px] text-muted-foreground">{s.label}</p>
                            <p className="text-lg font-bold tabular-nums">{s.value.toLocaleString()}</p>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or phone" className="h-10 pl-9 text-sm" />
                    </div>
                    <div className="flex rounded border border-border overflow-x-auto text-xs h-10 shrink-0">
                        {FILTERS.map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setFilter(f.id)}
                                className={cn("px-3 flex-1 sm:flex-none whitespace-nowrap", filter === f.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted/30")}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                {isLoading ? (
                    <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center text-sm text-muted-foreground border border-dashed border-border rounded">No users match.</div>
                ) : (
                    <div className="rounded border border-border/60 bg-card divide-y divide-border/50">
                        <div className="hidden md:grid grid-cols-[minmax(0,2fr)_110px_110px_110px_auto] gap-3 px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                            <span>User</span>
                            <span>Status</span>
                            <span className="text-right">SMS</span>
                            <span className="text-right">WhatsApp</span>
                            <span className="text-right w-[196px]">Actions</span>
                        </div>
                        {filtered.map((user) => {
                            const busy = busyId === String(user.id);
                            return (
                                <div key={user.id} className="px-4 py-3 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_110px_110px_110px_auto] gap-2 md:gap-3 md:items-center">
                                    <div className="min-w-0 flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
                                            {user.profile_image ? <img src={user.profile_image} alt="" className="w-full h-full object-cover" /> : (user.name || user.email).charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                                                {user.name || "Unnamed"}
                                                {user.role === "admin" && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Admin</Badge>}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                            <p className="text-[11px] text-muted-foreground truncate">{user.phone || "No phone"} · Joined {formatDate(user.created_at)}</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 md:block">
                                        {user.is_verified ? (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600"><BadgeCheck className="w-3.5 h-3.5" />Verified</span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600"><ShieldAlert className="w-3.5 h-3.5" />Unverified</span>
                                        )}
                                        <span className="md:hidden text-[11px] text-muted-foreground">
                                            · {user.sms_balance.toLocaleString()} SMS · {(user.whatsapp_balance || 0).toLocaleString()} WhatsApp
                                        </span>
                                    </div>

                                    <span className="hidden md:block text-sm text-right tabular-nums">{user.sms_balance.toLocaleString()}</span>
                                    <span className="hidden md:block text-sm text-right tabular-nums">{(user.whatsapp_balance || 0).toLocaleString()}</span>

                                    <div className="grid grid-cols-2 md:flex gap-2 md:justify-end">
                                        <Button
                                            size="sm"
                                            variant={user.is_verified ? "outline" : "default"}
                                            className="h-8 text-xs gap-1.5 md:w-[92px]"
                                            disabled={busy}
                                            onClick={() => toggleVerified(user)}
                                        >
                                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />}
                                            {user.is_verified ? "Unverify" : "Verify"}
                                        </Button>
                                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 md:w-[96px]" onClick={() => setAdjusting(user)}>
                                            <Wallet className="w-3.5 h-3.5" />
                                            Balance
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <AdjustBalanceDialog
                user={adjusting}
                onClose={() => setAdjusting(null)}
                onDone={(updated) => {
                    replaceUser(updated);
                    setAdjusting(null);
                }}
            />
        </SettingsLayout>
    );
}

function AdjustBalanceDialog({ user, onClose, onDone }: { user: UserResponse | null; onClose: () => void; onDone: (user: UserResponse) => void }) {
    const [kind, setKind] = useState<AdminAdjustBalanceRequest["kind"]>("sms");
    const [action, setAction] = useState<AdminAdjustBalanceRequest["action"]>("credit");
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);

    const current = user ? (kind === "sms" ? user.sms_balance : user.whatsapp_balance || 0) : 0;
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    const next = action === "credit" ? current + value : current - value;

    const reset = () => {
        setKind("sms");
        setAction("credit");
        setAmount("");
        setReason("");
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (value <= 0) return toast.error("Enter an amount above zero");
        if (next < 0) return toast.error(`The user only has ${current.toLocaleString()} credits`);
        setSaving(true);
        try {
            const updated = await apollosmsApi.users.adjustBalance(user.id, { kind, action, amount: value, reason: reason.trim() });
            toast.success(`${action === "credit" ? "Credited" : "Debited"} ${value.toLocaleString()} ${kind === "sms" ? "SMS" : "WhatsApp"} credits`);
            reset();
            onDone(updated);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to adjust balance");
        } finally {
            setSaving(false);
        }
    };

    const segment = (active: boolean, tone?: "credit" | "debit") =>
        cn(
            "h-10 rounded border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
            active
                ? tone === "debit" ? "border-rose-500 bg-rose-500/10 text-rose-600" : "border-primary bg-primary/5 text-primary"
                : "border-border/60 text-muted-foreground hover:bg-muted/20"
        );

    return (
        <Dialog
            open={!!user}
            onOpenChange={(open) => {
                if (!open) {
                    reset();
                    onClose();
                }
            }}
        >
            <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded">
                <DialogHeader>
                    <DialogTitle>Adjust balance</DialogTitle>
                    <DialogDescription className="truncate">{user?.name} · {user?.email}</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" className={segment(kind === "sms")} onClick={() => setKind("sms")}>
                            <Wallet className="w-3.5 h-3.5" />SMS
                        </button>
                        <button type="button" className={segment(kind === "whatsapp")} onClick={() => setKind("whatsapp")}>
                            <MessageCircle className="w-3.5 h-3.5" />WhatsApp
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" className={segment(action === "credit", "credit")} onClick={() => setAction("credit")}>
                            <Plus className="w-3.5 h-3.5" />Credit
                        </button>
                        <button type="button" className={segment(action === "debit", "debit")} onClick={() => setAction("debit")}>
                            <Minus className="w-3.5 h-3.5" />Debit
                        </button>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="adjust-amount" className="text-xs font-semibold">Credits</Label>
                        <Input id="adjust-amount" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100" className="h-10" autoFocus />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="adjust-reason" className="text-xs font-semibold">Reason <span className="font-normal text-muted-foreground">(shown to the user)</span></Label>
                        <Input id="adjust-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Refund for failed campaign" className="h-10" />
                    </div>
                    <div className="rounded border border-border/60 bg-muted/20 px-3 py-2 text-xs flex items-center justify-between">
                        <span className="text-muted-foreground">Balance</span>
                        <span className="tabular-nums">
                            {current.toLocaleString()} → <b className={cn(next < 0 && "text-rose-600")}>{next.toLocaleString()}</b>
                        </span>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }} className="h-10">Cancel</Button>
                        <Button type="submit" disabled={saving || value <= 0 || next < 0} className={cn("h-10 gap-1.5", action === "debit" && "bg-rose-600 hover:bg-rose-700")}>
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                            {action === "credit" ? "Credit" : "Debit"} {value > 0 ? value.toLocaleString() : ""}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
