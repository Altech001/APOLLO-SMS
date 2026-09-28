import { AdminSettings, apollosmsApi, ProfitRange, ProfitSummary, ProviderBalance } from "@/api/apollosms";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    AlertTriangle,
    BellRing,
    Code2,
    ExternalLink,
    Loader2,
    MessageCircle,
    RefreshCw,
    Save,
    Send,
    Settings2,
    Smartphone,
    TrendingUp,
    Wallet,
    X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

const RANGES: Array<{ id: ProfitRange; label: string }> = [
    { id: "today", label: "Today" },
    { id: "7d", label: "7 days" },
    { id: "30d", label: "30 days" },
    { id: "90d", label: "90 days" },
    { id: "year", label: "Year" },
    { id: "all", label: "All time" },
];

const RECHARGE_LINKS: Record<string, string> = {
    julysms: "https://app.julysms.com",
    africastalking: "https://account.africastalking.com",
};

const PROVIDER_LABELS: Record<string, string> = {
    julysms: "JulySMS",
    africastalking: "Africa's Talking",
    fuxx: "FUXX",
    local: "Local (simulated)",
    "": "Unknown",
};

const ugx = (n: number) => `UGX ${Math.round(n).toLocaleString()}`;
const compact = (n: number) => (Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
const shortDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function ProfitPage() {
    const [range, setRange] = useState<ProfitRange>("30d");
    const [panelOpen, setPanelOpen] = useState(false);

    const profit = useQuery({
        queryKey: ["apollosms", "admin-profit", range],
        queryFn: () => apollosmsApi.admin.profit(range),
    });
    const balances = useQuery({
        queryKey: ["apollosms", "admin-provider-balances"],
        queryFn: () => apollosmsApi.admin.providerBalances(),
        staleTime: 60_000,
    });

    const data = profit.data;
    const refreshing = profit.isFetching || balances.isFetching;

    return (
        <div className="min-h-screen bg-background md:pl-[280px]">
            <SEO title="Profit" path="/admin/profit" />
            <AppHeader />
            <div className="flex flex-col xl:flex-row">
                <main className="flex-1 min-w-0 px-4 sm:px-6 py-5 sm:py-6 space-y-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h1 className="text-lg font-semibold text-foreground">Profit</h1>
                            <p className="text-xs text-muted-foreground mt-0.5">Money collected minus what the SMS providers charge. WhatsApp and plans have no provider cost.</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 rounded" onClick={() => { profit.refetch(); balances.refetch(); }} disabled={refreshing}>
                                <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
                                <span className="hidden sm:inline">Refresh</span>
                            </Button>
                            <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 rounded xl:hidden" onClick={() => setPanelOpen(true)}>
                                <Settings2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Settings</span>
                            </Button>
                        </div>
                    </div>

                    <div className="flex gap-1 overflow-x-auto rounded border border-border bg-card p-1 w-full sm:w-fit [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {RANGES.map((r) => (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => setRange(r.id)}
                                className={cn(
                                    "shrink-0 rounded px-3 py-1.5 text-xs font-medium transition-colors",
                                    range === r.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"
                                )}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>

                    <BalanceStrip balances={balances.data} loading={balances.isLoading} className="xl:hidden" />

                    {profit.isLoading ? (
                        <div className="py-24 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>
                    ) : profit.isError || !data ? (
                        <div className="rounded border border-rose-500/40 bg-rose-500/5 p-4 text-sm text-rose-600">
                            {profit.error instanceof Error ? profit.error.message : "Unable to load the profit report"}
                        </div>
                    ) : (
                        <>
                            <Headline data={data} />
                            <RevenueChart data={data} />
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <ChannelSplit data={data} />
                                <RevenueSources data={data} />
                            </div>
                            <ProviderTable data={data} />
                        </>
                    )}
                </main>

                <aside className="hidden xl:block w-[360px] shrink-0 border-l border-border/50 bg-card/40 min-h-[calc(100dvh-57px)]">
                    <div className="sticky top-0 max-h-[calc(100dvh-57px)] overflow-y-auto p-5 space-y-6">
                        <BalanceStrip balances={balances.data} loading={balances.isLoading} stacked />
                        <SettingsForm />
                    </div>
                </aside>
            </div>

            {panelOpen && (
                <div className="fixed inset-0 z-50 xl:hidden">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setPanelOpen(false)} />
                    <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border shadow-xl flex flex-col">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                            <p className="text-sm font-semibold">Profit settings</p>
                            <button type="button" onClick={() => setPanelOpen(false)} className="w-8 h-8 rounded flex items-center justify-center hover:bg-muted" aria-label="Close settings">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            <SettingsForm onSaved={() => setPanelOpen(false)} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Headline({ data }: { data: ProfitSummary }) {
    const margin = data.total_revenue_ugx > 0 ? Math.round((data.total_profit_ugx / data.total_revenue_ugx) * 100) : 0;
    const tiles = [
        { label: "Revenue collected", value: ugx(data.total_revenue_ugx), note: `${data.topups.toLocaleString()} payments · ${data.paying_users.toLocaleString()} users` },
        { label: "SMS provider cost", value: ugx(data.sms_cost_ugx), note: `${(data.app_segments + data.api_segments).toLocaleString()} SMS sent` },
        { label: "WhatsApp revenue", value: ugx(data.whatsapp_revenue_ugx), note: `All profit · ${data.whatsapp_sent.toLocaleString()} sent` },
    ];
    return (
        <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-3">
            <div className="rounded border border-primary/30 bg-primary/5 p-4 sm:p-5 flex flex-col justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                    <TrendingUp className="w-4 h-4" />
                    Net profit
                </div>
                <p className={cn("text-3xl sm:text-4xl font-bold tabular-nums tracking-tight", data.total_profit_ugx < 0 ? "text-rose-600" : "text-foreground")}>
                    {ugx(data.total_profit_ugx)}
                </p>
                <p className="text-xs text-muted-foreground">
                    {margin}% margin · SMS profit {ugx(data.sms_profit_ugx)} · selling at ~{data.avg_sell_price_ugx.toFixed(1)} UGX per SMS
                </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-1 gap-3">
                {tiles.map((t) => (
                    <div key={t.label} className="rounded border border-border/60 bg-card px-4 py-3">
                        <p className="text-[11px] text-muted-foreground">{t.label}</p>
                        <p className="text-base font-bold tabular-nums">{t.value}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{t.note}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RevenueChart({ data }: { data: ProfitSummary }) {
    const [view, setView] = useState<"chart" | "table">("chart");
    const empty = data.daily.every((d) => d.revenue_ugx === 0 && d.sms_cost_ugx === 0);
    return (
        <section className="rounded border border-border/60 bg-card p-4 [--rev:#2a78d6] [--cost:#eb6834] dark:[--rev:#3987e5] dark:[--cost:#d95926]">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                    <h2 className="text-sm font-semibold">Revenue vs SMS cost</h2>
                    <p className="text-[11px] text-muted-foreground">Last {data.daily.length} days, per day</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-[var(--rev)]" />Revenue</span>
                        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-[var(--cost)]" />SMS cost</span>
                    </div>
                    <div className="flex rounded border border-border text-[11px] overflow-hidden">
                        {(["chart", "table"] as const).map((v) => (
                            <button key={v} type="button" onClick={() => setView(v)} className={cn("px-2 py-1 capitalize", view === v ? "bg-muted font-medium" : "text-muted-foreground")}>{v}</button>
                        ))}
                    </div>
                </div>
            </div>
            {view === "chart" ? (
                empty ? (
                    <div className="h-56 flex items-center justify-center text-xs text-muted-foreground">No payments or SMS in this period yet.</div>
                ) : (
                    <div className="h-56 sm:h-64 -ml-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                                <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={24} />
                                <YAxis tickFormatter={compact} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} />
                                <Tooltip
                                    cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.4 }}
                                    content={({ active, payload, label }) =>
                                        active && payload?.length ? (
                                            <div className="rounded border border-border bg-popover px-3 py-2 text-xs shadow-sm space-y-0.5">
                                                <p className="font-medium">{shortDay(String(label))}</p>
                                                <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--rev)]" />Revenue <b className="ml-auto pl-3 tabular-nums">{ugx(Number(payload[0]?.payload.revenue_ugx))}</b></p>
                                                <p className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--cost)]" />SMS cost <b className="ml-auto pl-3 tabular-nums">{ugx(Number(payload[0]?.payload.sms_cost_ugx))}</b></p>
                                                <p className="text-muted-foreground">Profit <b className="text-foreground tabular-nums">{ugx(Number(payload[0]?.payload.profit_ugx))}</b></p>
                                            </div>
                                        ) : null
                                    }
                                />
                                <Line type="monotone" dataKey="revenue_ugx" name="Revenue" stroke="var(--rev)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }} />
                                <Line type="monotone" dataKey="sms_cost_ugx" name="SMS cost" stroke="var(--cost)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )
            ) : (
                <div className="max-h-64 overflow-auto">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-card text-muted-foreground">
                            <tr><th className="text-left py-1.5 font-medium">Day</th><th className="text-right font-medium">Revenue</th><th className="text-right font-medium">SMS cost</th><th className="text-right font-medium">Profit</th></tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {[...data.daily].reverse().map((d) => (
                                <tr key={d.day}>
                                    <td className="py-1.5">{shortDay(d.day)}</td>
                                    <td className="text-right tabular-nums">{d.revenue_ugx.toLocaleString()}</td>
                                    <td className="text-right tabular-nums">{d.sms_cost_ugx.toLocaleString()}</td>
                                    <td className={cn("text-right tabular-nums font-medium", d.profit_ugx < 0 && "text-rose-600")}>{d.profit_ugx.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function ChannelSplit({ data }: { data: ProfitSummary }) {
    const rows = [
        { icon: <Smartphone className="w-4 h-4" />, label: "In-app SMS", segments: data.app_segments, revenue: data.app_revenue_ugx, cost: data.app_cost_ugx },
        { icon: <Code2 className="w-4 h-4" />, label: "Developer API", segments: data.api_segments, revenue: data.api_revenue_ugx, cost: data.api_cost_ugx },
    ];
    return (
        <section className="rounded border border-border/60 bg-card p-4">
            <h2 className="text-sm font-semibold">SMS: app vs API</h2>
            <p className="text-[11px] text-muted-foreground mb-3">Earned is SMS sent × the average price users paid per SMS.</p>
            <div className="space-y-3">
                {rows.map((r) => {
                    const profit = r.revenue - r.cost;
                    return (
                        <div key={r.label} className="rounded border border-border/50 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-2 text-sm font-medium">{r.icon}{r.label}</span>
                                <span className="text-xs text-muted-foreground tabular-nums">{r.segments.toLocaleString()} SMS</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                                <div><p className="text-muted-foreground">Earned</p><p className="font-semibold tabular-nums">{ugx(r.revenue)}</p></div>
                                <div><p className="text-muted-foreground">Cost</p><p className="font-semibold tabular-nums">{ugx(r.cost)}</p></div>
                                <div><p className="text-muted-foreground">Profit</p><p className={cn("font-semibold tabular-nums", profit < 0 && "text-rose-600")}>{ugx(profit)}</p></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function RevenueSources({ data }: { data: ProfitSummary }) {
    const total = Math.max(1, data.total_revenue_ugx);
    const rows = [
        { label: "SMS top-ups", value: data.sms_revenue_ugx },
        { label: "Plans", value: data.plan_revenue_ugx },
        { label: "WhatsApp credits", value: data.whatsapp_revenue_ugx },
    ];
    return (
        <section className="rounded border border-border/60 bg-card p-4">
            <h2 className="text-sm font-semibold">Where revenue came from</h2>
            <p className="text-[11px] text-muted-foreground mb-3">Completed mobile money and card payments.</p>
            <div className="space-y-3">
                {rows.map((r) => {
                    const pct = Math.round((r.value / total) * 100);
                    return (
                        <div key={r.label}>
                            <div className="flex items-center justify-between text-xs mb-1">
                                <span>{r.label}</span>
                                <span className="tabular-nums"><b>{ugx(r.value)}</b> <span className="text-muted-foreground">· {data.total_revenue_ugx > 0 ? pct : 0}%</span></span>
                            </div>
                            <div className="h-2 rounded bg-muted overflow-hidden">
                                <div className="h-full rounded bg-primary" style={{ width: `${data.total_revenue_ugx > 0 ? pct : 0}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function ProviderTable({ data }: { data: ProfitSummary }) {
    if (data.providers.length === 0) return null;
    return (
        <section className="rounded border border-border/60 bg-card">
            <div className="p-4 pb-2">
                <h2 className="text-sm font-semibold">SMS by provider</h2>
                <p className="text-[11px] text-muted-foreground">Sent and delivered messages only. Change provider prices in settings.</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[520px]">
                    <thead className="text-muted-foreground border-b border-border/50">
                        <tr>
                            <th className="text-left font-medium px-4 py-2">Provider</th>
                            <th className="text-left font-medium">Source</th>
                            <th className="text-right font-medium">SMS</th>
                            <th className="text-right font-medium">Price</th>
                            <th className="text-right font-medium">Cost</th>
                            <th className="text-right font-medium px-4">Profit</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {data.providers.map((p) => {
                            const profit = p.revenue_ugx - p.cost_ugx;
                            return (
                                <tr key={`${p.provider}-${p.source}`}>
                                    <td className="px-4 py-2 font-medium">{PROVIDER_LABELS[p.provider] || p.provider}</td>
                                    <td className="uppercase text-muted-foreground">{p.source}</td>
                                    <td className="text-right tabular-nums">{p.segments.toLocaleString()}</td>
                                    <td className="text-right tabular-nums">{p.unit_cost_ugx} UGX</td>
                                    <td className="text-right tabular-nums">{p.cost_ugx.toLocaleString()}</td>
                                    <td className={cn("text-right tabular-nums font-medium px-4", profit < 0 && "text-rose-600")}>{profit.toLocaleString()}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function BalanceStrip({ balances, loading, stacked, className }: { balances?: ProviderBalance[]; loading: boolean; stacked?: boolean; className?: string }) {
    return (
        <section className={cn("space-y-2", className)}>
            <h2 className="text-sm font-semibold flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" />Provider balances</h2>
            <div className={cn("grid gap-2", stacked ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
                {loading && !balances
                    ? [0, 1].map((i) => <div key={i} className="h-[92px] rounded border border-border/60 bg-muted/30 animate-pulse" />)
                    : (balances || []).map((b) => (
                        <div key={b.provider} className={cn("rounded border p-3 bg-card", b.low ? "border-rose-500/50" : "border-border/60")}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium">{b.label}</span>
                                {b.low && (
                                    <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">
                                        <AlertTriangle className="w-3 h-3" />Low
                                    </span>
                                )}
                            </div>
                            {!b.configured ? (
                                <p className="text-xs text-muted-foreground mt-1.5">Not configured</p>
                            ) : b.balance === null ? (
                                <p className="text-[11px] text-amber-600 mt-1.5 line-clamp-2">{b.error || "Balance unavailable"}</p>
                            ) : (
                                <p className="text-xl font-bold tabular-nums mt-1">{b.currency} {Math.round(b.balance).toLocaleString()}</p>
                            )}
                            <div className="flex items-center justify-between gap-2 mt-2">
                                <span className="text-[10px] text-muted-foreground">{b.threshold > 0 ? `Alert below ${Math.round(b.threshold).toLocaleString()}` : "No alert set"}</span>
                                {RECHARGE_LINKS[b.provider] && (
                                    <a href={RECHARGE_LINKS[b.provider]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                                        Recharge<ExternalLink className="w-3 h-3" />
                                    </a>
                                )}
                            </div>
                        </div>
                    ))}
            </div>
        </section>
    );
}

const EMPTY_SETTINGS: AdminSettings = {
    julysms_cost_ugx: 20,
    africastalking_cost_ugx: 27,
    other_cost_ugx: 0,
    alert_email: "",
    alert_phone: "",
    alert_whatsapp: "",
    email_enabled: true,
    sms_enabled: true,
    whatsapp_enabled: true,
    notify_on_topup: true,
    julysms_threshold: 0,
    africastalking_threshold: 0,
};

function SettingsForm({ onSaved }: { onSaved?: () => void }) {
    const queryClient = useQueryClient();
    const settings = useQuery({ queryKey: ["apollosms", "admin-settings"], queryFn: () => apollosmsApi.admin.settings() });
    const [form, setForm] = useState<AdminSettings>(EMPTY_SETTINGS);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        if (settings.data) setForm({ ...EMPTY_SETTINGS, ...settings.data });
    }, [settings.data]);

    const set = <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => setForm((f) => ({ ...f, [key]: value }));
    const num = (key: keyof AdminSettings) => ({
        type: "number" as const,
        inputMode: "decimal" as const,
        min: 0,
        value: String(form[key] ?? 0),
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, Number(e.target.value) as never),
        className: "h-9 rounded text-sm",
    });

    const save = async () => {
        setSaving(true);
        try {
            const saved = await apollosmsApi.admin.saveSettings(form);
            queryClient.setQueryData(["apollosms", "admin-settings"], saved);
            queryClient.invalidateQueries({ queryKey: ["apollosms", "admin-profit"] });
            queryClient.invalidateQueries({ queryKey: ["apollosms", "admin-provider-balances"] });
            toast.success("Settings saved");
            onSaved?.();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save settings");
        } finally {
            setSaving(false);
        }
    };

    const test = async () => {
        setTesting(true);
        try {
            const res = await apollosmsApi.admin.testAlert();
            const problems = res.problems || [];
            if (problems.length === 0) toast.success("Test alert sent on every enabled channel");
            else toast.warning(`Some channels failed: ${problems.join("; ")}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to send test alert");
        } finally {
            setTesting(false);
        }
    };

    const channels = useMemo(() => ([
        { key: "email_enabled", label: "Email", icon: <Send className="w-3.5 h-3.5" /> },
        { key: "sms_enabled", label: "SMS", icon: <Smartphone className="w-3.5 h-3.5" /> },
        { key: "whatsapp_enabled", label: "WhatsApp", icon: <MessageCircle className="w-3.5 h-3.5" /> },
    ] as const), []);

    if (settings.isLoading) return <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>;

    return (
        <div className="space-y-6">
            <section className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4 text-primary" />Provider prices</h3>
                <p className="text-[11px] text-muted-foreground -mt-2">What each provider charges you per SMS, in UGX.</p>
                <div className="grid grid-cols-3 gap-2">
                    <Field label="JulySMS"><Input {...num("julysms_cost_ugx")} /></Field>
                    <Field label="Africa's T."><Input {...num("africastalking_cost_ugx")} /></Field>
                    <Field label="Other"><Input {...num("other_cost_ugx")} /></Field>
                </div>
            </section>

            <section className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-primary" />Low balance alerts</h3>
                <p className="text-[11px] text-muted-foreground -mt-2">Alert me when a provider balance drops below this amount. 0 turns it off. Checked every 15 minutes.</p>
                <div className="grid grid-cols-2 gap-2">
                    <Field label="JulySMS below"><Input {...num("julysms_threshold")} /></Field>
                    <Field label="Africa's Talking below"><Input {...num("africastalking_threshold")} /></Field>
                </div>
            </section>

            <section className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><BellRing className="w-4 h-4 text-primary" />Where to alert me</h3>
                <p className="text-[11px] text-muted-foreground -mt-2">Empty fields use your account email and phone. WhatsApp alerts are sent from your linked WhatsApp number.</p>
                <Field label="Email"><Input value={form.alert_email} onChange={(e) => set("alert_email", e.target.value)} placeholder="you@company.com" className="h-9 rounded text-sm" /></Field>
                <Field label="SMS phone"><Input value={form.alert_phone} onChange={(e) => set("alert_phone", e.target.value)} placeholder="+256 7XX XXX XXX" className="h-9 rounded text-sm" /></Field>
                <Field label="WhatsApp number"><Input value={form.alert_whatsapp} onChange={(e) => set("alert_whatsapp", e.target.value)} placeholder="Same as SMS phone" className="h-9 rounded text-sm" /></Field>
                <div className="grid grid-cols-3 gap-2">
                    {channels.map((c) => (
                        <button
                            key={c.key}
                            type="button"
                            onClick={() => set(c.key, !form[c.key])}
                            className={cn(
                                "h-9 rounded border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors",
                                form[c.key] ? "border-primary bg-primary/5 text-primary" : "border-border/60 text-muted-foreground"
                            )}
                            aria-pressed={form[c.key]}
                        >
                            {c.icon}{c.label}
                        </button>
                    ))}
                </div>
                <label className="flex items-center justify-between gap-3 rounded border border-border/60 bg-card px-3 py-2.5">
                    <span className="text-xs">
                        <span className="font-medium block">Alert me on every user top-up</span>
                        <span className="text-muted-foreground">SMS, plan and WhatsApp payments</span>
                    </span>
                    <Switch checked={form.notify_on_topup} onCheckedChange={(v) => set("notify_on_topup", v)} />
                </label>
            </section>

            <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={test} disabled={testing} className="h-10 rounded text-xs gap-1.5">
                    {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5" />}
                    Send test
                </Button>
                <Button type="button" onClick={save} disabled={saving} className="h-10 rounded text-xs gap-1.5">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save settings
                </Button>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1 min-w-0">
            <Label className="text-[11px] font-medium text-muted-foreground truncate block">{label}</Label>
            {children}
        </div>
    );
}
