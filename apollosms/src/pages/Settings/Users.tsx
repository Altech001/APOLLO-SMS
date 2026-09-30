import { AdminAdjustBalanceRequest, apollosmsApi, UserResponse } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    BadgeCheck,
    ChevronLeft,
    ChevronRight,
    Loader2,
    MessageCircle,
    Minus,
    MoreHorizontal,
    Plus,
    RefreshCw,
    Search,
    ShieldOff,
    Users,
    Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import SettingsLayout from "./SettingsLayout";

const usersQueryKey = ["apollosms", "admin-users"] as const;
const PAGE_SIZE = 3;

type Filter = "all" | "verified" | "unverified" | "admin";

const FILTERS: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "All" },
    { id: "unverified", label: "Unverified" },
    { id: "verified", label: "Verified" },
    { id: "admin", label: "Admins" },
];

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

const pageNumbers = (page: number, total: number): Array<number | "…"> => {
    if (total <= 3) return Array.from({ length: total }, (_, i) => i + 1);
    if (page <= 3) return [1, 2, 3, 4, "…", total];
    if (page >= total - 2) return [1, "…", total - 3, total - 2, total - 1, total];
    return [1, "…", page - 1, page, page + 1, "…", total];
};

export default function UsersAdminPage() {
    const queryClient = useQueryClient();
    const { data: users = [], isLoading, isFetching, refetch } = useQuery({
        queryKey: usersQueryKey,
        queryFn: () => apollosmsApi.users.list(),
    });
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [page, setPage] = useState(1);
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

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageStart = (currentPage - 1) * PAGE_SIZE;
    const pageUsers = filtered.slice(pageStart, pageStart + PAGE_SIZE);

    useEffect(() => setPage(1), [search, filter]);

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

    const renderActions = (user: UserResponse) => {
        const busy = busyId === String(user.id);
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" disabled={busy} aria-label="User actions">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem className="text-xs gap-2" onClick={() => setAdjusting(user)}>
                        <Wallet className="w-3.5 h-3.5" />
                        Adjust balance
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs gap-2" onClick={() => toggleVerified(user)}>
                        {user.is_verified ? <ShieldOff className="w-3.5 h-3.5" /> : <BadgeCheck className="w-3.5 h-3.5" />}
                        {user.is_verified ? "Remove verification" : "Verify user"}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        );
    };

    const avatar = (user: UserResponse) => (
        <div className="w-8 h-8 rounded-full bg-muted text-foreground/70 flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden">
            {user.profile_image ? <img src={user.profile_image} alt="" className="w-full h-full object-cover" /> : (user.name || user.email).charAt(0).toUpperCase()}
        </div>
    );

    const status = (user: UserResponse) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("w-1.5 h-1.5 rounded-full", user.is_verified ? "bg-emerald-500" : "bg-amber-500")} />
            {user.is_verified ? "Verified" : "Unverified"}
        </span>
    );

    return (
        <SettingsLayout title="Users" showNav={false}>
            <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-semibold text-foreground">Users</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">Verify accounts and manage credit balances.</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh">
                        <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
                    </Button>
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 border-y border-border/60 py-4">
                    {[
                        { label: "Total users", value: stats.total },
                        { label: "Unverified", value: stats.unverified },
                        { label: "SMS credits", value: stats.sms },
                        { label: "WhatsApp credits", value: stats.whatsapp },
                    ].map((s) => (
                        <div key={s.label} className="px-1 sm:px-4 sm:border-l sm:first:border-l-0 sm:first:pl-0 border-border/60">
                            <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
                            <dd className="text-xl font-semibold tabular-nums mt-0.5">{s.value.toLocaleString()}</dd>
                        </div>
                    ))}
                </dl>

                <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {FILTERS.map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setFilter(f.id)}
                                className={cn(
                                    "h-8 px-3 rounded text-xs font-medium whitespace-nowrap transition-colors",
                                    filter === f.id ? "bg-primary text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                )}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                    <div className="relative sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users" className="h-9 pl-8 text-sm" />
                    </div>
                </div>

                <div className="rounded border border-primary/40 bg-card overflow-hidden">
                    {isLoading ? (
                        <div className="py-20 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
                    ) : filtered.length === 0 ? (
                        <div className="py-16 text-center">
                            <Users className="w-6 h-6 mx-auto text-muted-foreground/50" />
                            <p className="text-sm font-medium mt-3">No users found</p>
                            <p className="text-xs text-muted-foreground mt-1">Try a different search or filter.</p>
                        </div>
                    ) : (
                        <>
                            <Table className="hidden md:table">
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-primary/20">
                                        <TableHead className="h-10 text-[11px] font-medium text-muted-foreground pl-4">User</TableHead>
                                        <TableHead className="h-10 text-[11px] font-medium text-muted-foreground">Status</TableHead>
                                        <TableHead className="h-10 text-[11px] font-medium text-muted-foreground text-right">SMS</TableHead>
                                        <TableHead className="h-10 text-[11px] font-medium text-muted-foreground text-right">WhatsApp</TableHead>
                                        <TableHead className="h-10 text-[11px] font-medium text-muted-foreground">Joined</TableHead>
                                        <TableHead className="h-10 w-12" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pageUsers.map((user) => (
                                        <TableRow key={user.id} className="border-border/50 hover:bg-muted/30">
                                            <TableCell className="py-3 pl-4">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    {avatar(user)}
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium truncate flex items-center gap-1.5">
                                                            {user.name || "Unnamed"}
                                                            {user.role === "admin" && <span className="text-[10px] font-medium text-muted-foreground border border-border rounded px-1">Admin</span>}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-3">{status(user)}</TableCell>
                                            <TableCell className="py-3 text-right text-sm tabular-nums">{user.sms_balance.toLocaleString()}</TableCell>
                                            <TableCell className="py-3 text-right text-sm tabular-nums">{(user.whatsapp_balance || 0).toLocaleString()}</TableCell>
                                            <TableCell className="py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(user.created_at)}</TableCell>
                                            <TableCell className="py-3 pr-3 text-right">{renderActions(user)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>

                            <ul className="md:hidden divide-y divide-border/50">
                                {pageUsers.map((user) => (
                                    <li key={user.id} className="flex items-center gap-3 px-4 py-3">
                                        {avatar(user)}
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium truncate">{user.name || "Unnamed"}</p>
                                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                                                {status(user)}
                                                <span>·</span>
                                                <span className="tabular-nums">{user.sms_balance.toLocaleString()} SMS</span>
                                                <span>·</span>
                                                <span className="tabular-nums">{(user.whatsapp_balance || 0).toLocaleString()} WA</span>
                                            </div>
                                        </div>
                                        {renderActions(user)}
                                    </li>
                                ))}
                            </ul>

                            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/60">
                                <p className="text-xs text-muted-foreground tabular-nums">
                                    {pageStart + 1}–{pageStart + pageUsers.length} of {filtered.length}
                                </p>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page">
                                        <ChevronLeft className="w-4 h-4" />
                                    </Button>
                                    {pageNumbers(currentPage, totalPages).map((n, i) =>
                                        n === "…" ? (
                                            <span key={`gap-${i}`} className="hidden sm:inline w-6 text-center text-xs text-muted-foreground">…</span>
                                        ) : (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => setPage(n)}
                                                className={cn(
                                                    "hidden sm:inline-flex h-8 min-w-8 px-2 items-center justify-center rounded-md text-xs tabular-nums transition-colors",
                                                    n === currentPage ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:bg-muted/50"
                                                )}
                                            >
                                                {n}
                                            </button>
                                        )
                                    )}
                                    <span className="sm:hidden text-xs text-muted-foreground tabular-nums px-1">{currentPage} / {totalPages}</span>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)} aria-label="Next page">
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
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
