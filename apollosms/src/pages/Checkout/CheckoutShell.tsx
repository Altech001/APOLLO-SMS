import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { useUsdRate } from "@/hooks/use-usd-rate";
import { ParsedCheckoutOrder } from "@/lib/checkout";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface CheckoutShellProps {
    title: string;
    subtitle: string;
    order: ParsedCheckoutOrder;
    currency: "ugx" | "usd";
    children: React.ReactNode;
}

export default function CheckoutShell({ title, subtitle, order, currency, children }: CheckoutShellProps) {
    const navigate = useNavigate();
    const { formatUsd, rate, isLive } = useUsdRate();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: Event) => setSidebarCollapsed((e as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    const ugx = `UGX ${order.amountUgx.toLocaleString()}`;
    const usd = formatUsd(order.amountUgx);

    return (
        <div className={cn("min-h-screen bg-background transition-all duration-300 flex flex-col", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}>
            <SEO title={title} />
            <AppHeader />

            <main className="flex-1 px-4 sm:px-6 py-6 sm:py-10">
                <div className="max-w-4xl mx-auto space-y-6">
                    <button type="button" onClick={() => navigate(-1)} className="border p-4 rounded-full inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Back
                    </button>

                    <div>
                        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                    </div>

                    {order.amountUgx <= 0 ? (
                        <div className="rounded border border-dashed border-border p-10 text-center space-y-3">
                            <p className="text-sm font-medium">Nothing to pay for</p>
                            <Button variant="outline" className="h-9 text-xs" onClick={() => navigate("/sms-tp")}>Go to top-ups</Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
                            <section className="rounded border border-border/60 bg-card p-5 space-y-5">{children}</section>

                            <aside className="rounded border border-border/60 bg-card p-5 space-y-4">
                                <p className="text-sm font-semibold">Order summary</p>
                                <div className="space-y-2 text-xs">
                                    <SummaryRow label="Item" value={order.label} />
                                    {order.sms > 0 && <SummaryRow label="SMS credits" value={order.sms.toLocaleString()} />}
                                    {order.credits > 0 && <SummaryRow label="WhatsApp credits" value={order.credits.toLocaleString()} />}
                                    <SummaryRow label="Amount" value={currency === "usd" ? ugx : usd} />
                                </div>
                                <div className="border-t border-border/60 pt-3 flex items-end justify-between">
                                    <span className="text-xs text-muted-foreground">Total</span>
                                    <span className="text-xl font-semibold tabular-nums">{currency === "usd" ? usd : ugx}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                    1 USD = UGX {Math.round(rate).toLocaleString()}{isLive ? "" : " (estimated)"}
                                </p>
                            </aside>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-right tabular-nums">{value}</span>
        </div>
    );
}
