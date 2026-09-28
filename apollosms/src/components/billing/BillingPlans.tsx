import { apollosmsApi, BillingPlan, CreateCollectionResponse } from "@/api/apollosms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifyBillingChange, useBillingSummary } from "@/hooks/use-billing-summary";
import { formatUgandanPhone, useCollectionPayment } from "@/hooks/use-collection-payment";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Check, CheckCircle2, Coins, Loader2, MessageCircle, MessageSquare, Sparkles, XCircle } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const PERIOD_LABEL: Record<number, string> = { 7: "week", 30: "month", 31: "month", 365: "year" };

const periodLabel = (plan: BillingPlan) =>
    plan.duration_days <= 0 ? "forever" : PERIOD_LABEL[plan.duration_days] || `${plan.duration_days} days`;

const formatUGX = (value: number) => `UGX ${value.toLocaleString()}`;

type Purchase =
    | { kind: "plan"; plan: BillingPlan }
    | { kind: "whatsapp"; credits: number; price: number };

export type RedeemType = "sms" | "whatsapp";

interface BillingPlansProps {
    /** Hide the "Buy WhatsApp credits" box when the host page has its own purchase form. */
    showWhatsAppPurchase?: boolean;
    /** Opens the host's redeem dialog; without it, Redeem links to the SMS & WhatsApp purchase page. */
    onRedeem?: (type: RedeemType) => void;
}

export default function BillingPlans({ showWhatsAppPurchase = true, onRedeem }: BillingPlansProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const redeem = (type: RedeemType) => (onRedeem ? onRedeem(type) : navigate(`/sms-tp?redeem=${type}`));
    const { summary, isLoading: summaryLoading, refresh } = useBillingSummary();
    const [plans, setPlans] = useState<BillingPlan[]>([]);
    const [plansLoading, setPlansLoading] = useState(true);
    const [purchase, setPurchase] = useState<Purchase | null>(null);
    const [phone, setPhone] = useState(user?.phone_number || "");
    const [whatsAppQty, setWhatsAppQty] = useState("");
    const [switchingFree, setSwitchingFree] = useState(false);

    const payment = useCollectionPayment((collection: CreateCollectionResponse) => {
        toast.success(collection.purpose === "plan" ? "Plan activated" : "WhatsApp credits added");
        refresh();
    });

    useEffect(() => {
        apollosmsApi.billing.plans()
            .then(setPlans)
            .catch((error) => toast.error(error instanceof Error ? error.message : "Unable to load plans"))
            .finally(() => setPlansLoading(false));
    }, []);

    useEffect(() => {
        if (!phone && user?.phone_number) setPhone(user.phone_number);
    }, [phone, user?.phone_number]);

    useEffect(() => {
        if (summary && !whatsAppQty) {
            setWhatsAppQty(String(Math.max(summary.min_whatsapp_credit_order, 100)));
        }
    }, [summary, whatsAppQty]);

    const currentPlan = summary?.plan;
    const qty = parseInt(whatsAppQty.replace(/[^0-9]/g, ""), 10) || 0;
    const whatsAppTotal = qty * (summary?.whatsapp_price_ugx || 0);
    const minOrder = summary?.min_whatsapp_credit_order || 0;

    const openPurchase = (next: Purchase) => {
        payment.reset();
        setPurchase(next);
    };

    const closePurchase = () => {
        if (payment.stage === "waiting" && !window.confirm("Stop waiting for this payment? If you approve it on your phone, your account still updates.")) {
            return;
        }
        payment.reset();
        setPurchase(null);
    };

    const handlePay = () => {
        if (!purchase) return;
        if (!phone.trim()) {
            toast.error("Enter the mobile money number to charge");
            return;
        }
        const phoneNumber = formatUgandanPhone(phone.trim());
        payment.start(async () => {
            if (purchase.kind === "plan") {
                const res = await apollosmsApi.billing.subscribe({ plan_id: purchase.plan.id, phone_number: phoneNumber });
                if (!res.collection) throw new Error("The payment could not be started");
                return res.collection;
            }
            return apollosmsApi.billing.buyWhatsAppCredits({ credits: purchase.credits, phone_number: phoneNumber });
        });
    };

    const handleSwitchToFree = async (plan: BillingPlan) => {
        if (!window.confirm(`Switch to the ${plan.name} plan now? Your current plan ends immediately and its remaining days are not refunded. Credits you already have are kept.`)) {
            return;
        }
        setSwitchingFree(true);
        try {
            await apollosmsApi.billing.subscribe({ plan_id: plan.id });
            toast.success(`You're now on the ${plan.name} plan`);
            notifyBillingChange();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to change plan");
        } finally {
            setSwitchingFree(false);
        }
    };

    const handleBuyWhatsApp = () => {
        if (!summary?.whatsapp_price_ugx) {
            toast.error("WhatsApp credits are not for sale on your plan");
            return;
        }
        if (qty < minOrder) {
            toast.error(`Minimum order is ${minOrder.toLocaleString()} WhatsApp credits`);
            return;
        }
        openPurchase({ kind: "whatsapp", credits: qty, price: summary.whatsapp_price_ugx });
    };

    const purchaseTotal = purchase?.kind === "plan" ? purchase.plan.price_ugx : purchase ? purchase.credits * purchase.price : 0;

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <BalanceTile
                    label="Current plan"
                    value={summaryLoading ? "…" : currentPlan?.name || "Free"}
                    hint={summary?.subscription_expires_at
                        ? `Renews manually · ends ${new Date(summary.subscription_expires_at).toLocaleDateString()}`
                        : "No expiry"}
                />
                <BalanceTile
                    label="SMS balance"
                    value={`${(summary?.sms_balance || 0).toLocaleString()} SMS`}
                    hint={`${summary?.free_sms_remaining ?? 0} free SMS left today · ${formatUGX(summary?.sms_price_ugx || 0)}/SMS`}
                    action={{ label: "Buy SMS", onClick: () => redeem("sms") }}
                />
                <BalanceTile
                    label="WhatsApp balance"
                    value={`${(summary?.whatsapp_balance || 0).toLocaleString()} messages`}
                    hint={`${summary?.free_whatsapp_remaining ?? 0} free WhatsApp left today`}
                    action={{ label: "Buy WhatsApp", onClick: () => redeem("whatsapp") }}
                />
            </div>

            {/* Plan cards */}
            <div>
                <div className="gap-2 flex justify-between">
                    <div className="mb-4">
                        <h2 className="text-sm font-bold text-foreground">Plans</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Paid plans are prepaid for their period. Buying your current plan again extends it.
                        </p>
                    </div>
                    <div>
                        <Button onClick={() => redeem("sms")} type="submit">Reddem Credits</Button>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {plansLoading && Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-80 rounded border border-border/30 bg-muted/20 animate-pulse" />
                    ))}
                    {plans.map((plan) => {
                        const isCurrent = currentPlan?.id === plan.id;
                        const isFree = plan.price_ugx <= 0;
                        const features = plan.features.split("\n").map((f) => f.trim()).filter(Boolean);
                        return (
                            <div
                                key={plan.id}
                                className={cn(
                                    "relative rounded border p-5 flex flex-col bg-card",
                                    plan.is_popular ? "border-primary shadow-md" : "border-border/40",
                                    isCurrent && "ring-2 ring-emerald-500/60"
                                )}
                            >
                                <div className="flex items-center justify-between gap-2 min-h-[22px]">
                                    <h3 className="text-sm font-bold text-foreground">{plan.name}</h3>
                                    <div className="flex gap-1">
                                        {plan.is_popular && <Badge className="text-[10px] px-2 py-0 rounded-full">Popular</Badge>}
                                        {isCurrent && (
                                            <Badge variant="outline" className="text-[10px] px-2 py-0 rounded-full border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
                                                Current
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-1 min-h-[32px]">{plan.description}</p>

                                <div className="mt-4">
                                    <span className="text-2xl font-black text-foreground">{isFree ? "Free" : formatUGX(plan.price_ugx)}</span>
                                    {!isFree && <span className="text-xs text-muted-foreground"> / {periodLabel(plan)}</span>}
                                </div>

                                <ul className="mt-4 space-y-2 flex-1">
                                    {features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-2 text-xs text-foreground/90">
                                            <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <div className="mt-5">
                                    {isFree ? (
                                        <Button
                                            variant="outline"
                                            className="w-full h-10 text-xs font-semibold"
                                            disabled={isCurrent || switchingFree}
                                            onClick={() => handleSwitchToFree(plan)}
                                        >
                                            {isCurrent ? "Current plan" : "Switch to Free"}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant={plan.is_popular ? "default" : "outline"}
                                            className="w-full h-10 text-xs font-semibold"
                                            onClick={() => openPurchase({ kind: "plan", plan })}
                                        >
                                            {isCurrent ? `Extend ${plan.name}` : `Choose ${plan.name}`}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* WhatsApp credits */}
            {showWhatsAppPurchase && (
                <div className="rounded border border-border/40 p-5 flex flex-col md:flex-row md:items-end gap-4 justify-between">
                    <div className="space-y-1">
                        <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                            <MessageCircle className="w-4 h-4 text-emerald-600" />
                            Buy WhatsApp credits
                        </h2>
                        <p className="text-xs text-muted-foreground max-w-md">
                            One credit sends one WhatsApp message. Your plan's free messages are used first each day.
                            {summary?.plan.whatsapp_per_sms
                                ? ` Buying SMS also gives ${summary.plan.whatsapp_per_sms} bonus WhatsApp message${summary.plan.whatsapp_per_sms === 1 ? "" : "s"} per SMS.`
                                : ""}
                        </p>
                    </div>
                    <div className="flex items-end gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="wa-credit-qty" className="text-[11px] text-muted-foreground">Credits (min {minOrder.toLocaleString()})</Label>
                            <Input
                                id="wa-credit-qty"
                                inputMode="numeric"
                                value={whatsAppQty}
                                onChange={(e) => setWhatsAppQty(e.target.value)}
                                className="h-10 w-32 text-sm font-mono"
                            />
                        </div>
                        <div className="text-xs text-muted-foreground pb-2.5 whitespace-nowrap">
                            × {formatUGX(summary?.whatsapp_price_ugx || 0)} = <b className="text-foreground">{formatUGX(whatsAppTotal)}</b>
                        </div>
                        <Button className="h-10 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleBuyWhatsApp}>
                            Buy credits
                        </Button>
                    </div>
                </div>
            )}

            {/* Payment dialog */}
            <Dialog open={purchase !== null} onOpenChange={(open) => { if (!open) closePurchase(); }}>
                <DialogContent className="sm:max-w-md rounded">
                    <DialogHeader>
                        <DialogTitle className="text-base">
                            {purchase?.kind === "plan" ? `${purchase.plan.name} plan` : "WhatsApp credits"}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            {purchase?.kind === "plan"
                                ? `${formatUGX(purchase.plan.price_ugx)} for ${purchase.plan.duration_days} days, includes ${purchase.plan.whatsapp_credits.toLocaleString()} WhatsApp messages.`
                                : purchase ? `${purchase.credits.toLocaleString()} credits at ${formatUGX(purchase.price)} each.` : ""}
                        </DialogDescription>
                    </DialogHeader>

                    {payment.stage === "waiting" || payment.stage === "starting" ? (
                        <div className="py-6 text-center space-y-3">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                            <p className="text-sm">{payment.stage === "starting" ? "Starting payment…" : "Approve the payment on your phone"}</p>
                            <p className="text-[11px] text-muted-foreground">
                                We sent a mobile money prompt for {formatUGX(purchaseTotal)}. Status: {payment.status}
                            </p>
                        </div>
                    ) : payment.stage === "completed" ? (
                        <div className="py-6 text-center space-y-3">
                            <CheckCircle2 className="w-9 h-9 mx-auto text-emerald-600" />
                            <p className="text-sm">Payment received</p>
                            <p className="text-[11px] text-muted-foreground">
                                {purchase?.kind === "plan" ? "Your plan is active." : "Your WhatsApp credits were added."}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3 py-2">
                            {payment.stage === "failed" && (
                                <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-500/10 rounded p-2">
                                    <XCircle className="w-4 h-4 shrink-0" />
                                    <span>{payment.error}</span>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label htmlFor="billing-phone" className="text-xs font-semibold">Mobile money number</Label>
                                <Input
                                    id="billing-phone"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="0700000000"
                                    className="h-10 text-sm font-mono"
                                />
                            </div>
                            <div className="flex justify-between text-sm border-t border-border/30 pt-3">
                                <span className="text-muted-foreground">Total</span>
                                <span className="font-bold">{formatUGX(purchaseTotal)}</span>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2">
                        {payment.stage === "completed" ? (
                            <Button className="h-10 text-xs" onClick={() => { payment.reset(); setPurchase(null); }}>Done</Button>
                        ) : (
                            <>
                                <Button variant="outline" className="h-10 text-xs" onClick={closePurchase}>Cancel</Button>
                                {(payment.stage === "idle" || payment.stage === "failed") && (
                                    <Button className="h-10 text-xs" onClick={handlePay}>
                                        {payment.stage === "failed" ? "Try again" : `Pay ${formatUGX(purchaseTotal)}`}
                                    </Button>
                                )}
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function BalanceTile({ value, hint, action }: {
    label: string;
    value: string;
    hint: string;
    action?: { label: string; onClick: () => void };
}) {
    return (
        <div className="border border-primary/50 rounded p-4">
            <p className="text-2xl font-black text-foreground mt-1">{value}</p>
            <div className="flex items-end justify-between gap-2 mt-1">
                <p className="text-[11px] text-muted-foreground">{hint}</p>
                {action && (
                    <button type="button" onClick={action.onClick} className="text-[11px] font-semibold text-primary hover:underline shrink-0">
                        {action.label}
                    </button>
                )}
            </div>
        </div>
    );
}

