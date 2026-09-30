import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { notifyBillingChange } from "@/hooks/use-billing-summary";
import { useCollectionPayment } from "@/hooks/use-collection-payment";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function CardReturn() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const reference = params.get("reference") || "";
    const payment = useCollectionPayment(() => notifyBillingChange());
    const { start } = payment;
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: Event) => setSidebarCollapsed((e as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    useEffect(() => {
        if (!reference) return;
        void start(async () => ({ reference, status: "pending", amount_ugx: 0, sms_credits: 0, price_per_sms: 0 }));
    }, [reference, start]);

    const done = payment.stage === "completed";
    const failed = !reference || payment.stage === "failed";

    return (
        <div className={cn("min-h-screen bg-background transition-all duration-300 flex flex-col", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}>
            <SEO title="Card payment" />
            <AppHeader />
            <main className="flex-1 flex items-center justify-center px-4 py-10">
                <div className="w-full max-w-sm rounded-lg border border-border/60 bg-card p-6 text-center space-y-4">
                    {done ? (
                        <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
                    ) : failed ? (
                        <XCircle className="w-10 h-10 mx-auto text-rose-600" />
                    ) : (
                        <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
                    )}
                    <div className="space-y-1">
                        <h1 className="text-base font-semibold">
                            {done ? "Payment received" : failed ? "Payment not completed" : "Confirming your card payment…"}
                        </h1>
                        <p className="text-xs text-muted-foreground">
                            {done
                                ? "Your account has been updated."
                                : failed
                                    ? payment.error || "We couldn't find this payment."
                                    : "This usually takes a few seconds. Please keep this page open."}
                        </p>
                    </div>
                    {reference && <p className="text-[10px] font-mono text-muted-foreground break-all">{reference}</p>}
                    {(done || failed) && (
                        <div className="flex gap-2">
                            <Button variant="outline" className="flex-1 h-10 text-xs" onClick={() => navigate("/settings/billing")}>Billing history</Button>
                            <Button className="flex-1 h-10 text-xs" onClick={() => navigate("/sms-tp")}>{done ? "Done" : "Try again"}</Button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
