import { renultApi } from "@/api/apollosms";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBillingSummary } from "@/hooks/use-billing-summary";
import BillingPlans, { RedeemType } from "@/components/billing/BillingPlans";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import WhatsAppCreditsPurchase from "@/components/billing/WhatsAppCreditsPurchase";
import PaymentMethodPicker from "@/components/billing/PaymentMethodPicker";
import { checkoutPath, PaymentMethod } from "@/lib/checkout";
import { useUsdRate } from "@/hooks/use-usd-rate";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, Variants } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Coins, Loader2, MessageCircle, MessageSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

const TIERS = [
    { min: 0, max: 20000, rate: 32 },
    { min: 20001, max: 100000, rate: 30 },
    { min: 100001, max: 200000, rate: 28 },
    { min: 200001, max: Infinity, rate: 25 },
];

const MIN_TOPUP = 500;
const MAX_TOPUP = 10000000;

const getRateForAmount = (amount: number) => {
    const tier = TIERS.find(t => amount >= t.min && amount <= t.max);
    return tier?.rate ?? 32;
};

const slideVariants: Variants = {
    enter: (direction: number) => ({ x: direction > 0 ? 100 : -100, opacity: 0 }),
    center: {
        x: 0,
        opacity: 1,
        transition: { x: { type: "spring", stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } },
    },
    exit: (direction: number) => ({
        x: direction < 0 ? 100 : -100,
        opacity: 0,
        transition: { x: { type: "spring", stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } },
    }),
};

export default function Withdrawal() {
    const navigate = useNavigate();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: Event) => setSidebarCollapsed((e as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    const { summary: billingSummary } = useBillingSummary();
    const { formatUsd } = useUsdRate();
    // The redeem dialog is driven by the URL (?redeem=sms|whatsapp) so other pages can open it directly.
    const [searchParams, setSearchParams] = useSearchParams();
    const redeemParam = searchParams.get("redeem");
    const isRedeemOpen = redeemParam === "sms" || redeemParam === "whatsapp";
    const redeemType: RedeemType = redeemParam === "whatsapp" ? "whatsapp" : "sms";
    const setRedeemType = (type: RedeemType) => setSearchParams({ redeem: type }, { replace: true });

    const [walletBalance, setWalletBalance] = useState(0);
    const [isWalletLoading, setIsWalletLoading] = useState(true);
    const [step, setStep] = useState<1 | 2>(1);
    const [direction, setDirection] = useState(1);
    const [payMethod, setPayMethod] = useState<PaymentMethod>("mobile_money");
    const [customAmount, setCustomAmount] = useState("");

    const customNumeric = parseInt(customAmount.replace(/[^0-9]/g, ""), 10) || 0;
    // Plans with a fixed SMS price (e.g. Weekly 30 UGX, Yearly 29 UGX) override the standard tiers.
    const planSmsPrice = billingSummary?.plan.sms_price_ugx || 0;
    const customRate = useMemo(
        () => (planSmsPrice > 0 ? planSmsPrice : getRateForAmount(customNumeric)),
        [customNumeric, planSmsPrice]
    );
    const customSmsCount = customNumeric > 0 ? Math.floor(customNumeric / customRate) : 0;
    const bonusWhatsApp = customSmsCount * (billingSummary?.plan.whatsapp_per_sms || 0);
    const amountValid = customNumeric >= MIN_TOPUP && customNumeric <= MAX_TOPUP;

    useEffect(() => {
        let mounted = true;
        setIsWalletLoading(true);
        renultApi.wallet.get()
            .then((wallet) => {
                if (mounted) setWalletBalance(wallet.cash_balance);
            })
            .catch((error) => {
                toast.error(error instanceof Error ? error.message : "Unable to load wallet");
            })
            .finally(() => {
                if (mounted) setIsWalletLoading(false);
            });
        return () => { mounted = false; };
    }, []);

    const changeStep = (newStep: 1 | 2) => {
        setDirection(newStep > step ? 1 : -1);
        setStep(newStep);
    };

    const continueToCheckout = () => {
        if (!amountValid) {
            toast.error(`Enter an amount between ${MIN_TOPUP.toLocaleString()} and ${MAX_TOPUP.toLocaleString()} UGX.`);
            return;
        }
        navigate(checkoutPath(payMethod, { purpose: "sms", amountUgx: customNumeric, sms: customSmsCount, label: "SMS credits" }));
    };

    const closeRedeem = () => {
        setStep(1);
        setSearchParams({}, { replace: true });
    };

    const stepDot = (n: 1 | 2, label: string) => (
        <div className="flex flex-col items-center gap-1.5 z-10">
            <button
                type="button"
                onClick={() => n < step && changeStep(n)}
                disabled={n >= step}
                className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 border-2 disabled:cursor-default",
                    step >= n ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border text-muted-foreground",
                    step === n && "scale-105"
                )}
            >
                {step > n ? <Check className="w-4 h-4 stroke-[3]" /> : n}
            </button>
            <span className={cn("text-[10px] font-bold transition-colors duration-300", step === n ? "text-primary" : "text-muted-foreground")}>{label}</span>
        </div>
    );

    return (
        <div className={cn("min-h-screen bg-background transition-all duration-300 flex flex-col", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}>
            <SEO title="Buy SMS & WhatsApp Credits" />
            <AppHeader />

            <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-8">
                <div className="w-full max-w-7xl space-y-6">
                    <BillingPlans showWhatsAppPurchase={false} onRedeem={setRedeemType} />
                </div>

                <Dialog open={isRedeemOpen} onOpenChange={(open) => { if (!open) closeRedeem(); }}>
                    <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto rounded p-5">
                        <DialogHeader>
                            <DialogTitle className="text-base">Redeem credits</DialogTitle>
                            <DialogDescription className="text-xs">Buy SMS or WhatsApp messages with mobile money, card or PayPal.</DialogDescription>
                        </DialogHeader>
                        <div className="w-full space-y-5">
                            <div className="grid grid-cols-2 gap-1 p-1 rounded border border-border/40 bg-card/50 backdrop-blur-sm">
                                {([
                                    { value: "sms", label: "Buy SMS", icon: <MessageSquare className="w-4 h-4" /> },
                                    { value: "whatsapp", label: "Buy WhatsApp", icon: <MessageCircle className="w-4 h-4" /> },
                                ] as const).map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setRedeemType(option.value)}
                                        className={cn(
                                            "h-10 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-colors",
                                            redeemType === option.value
                                                ? option.value === "whatsapp" ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground"
                                                : "text-muted-foreground hover:bg-muted/40"
                                        )}
                                    >
                                        {option.icon}
                                        {option.label}
                                    </button>
                                ))}
                            </div>

                            {billingSummary && (
                                <p className="text-[11px] text-center text-muted-foreground -mt-2">
                                    On the <b className="text-foreground">{billingSummary.plan.name}</b> plan:{" "}
                                    {redeemType === "sms"
                                        ? `SMS at UGX ${customRate} each${billingSummary.plan.whatsapp_per_sms ? `, +${billingSummary.plan.whatsapp_per_sms} WhatsApp bonus per SMS` : ""}`
                                        : `WhatsApp at UGX ${billingSummary.whatsapp_price_ugx} per message`}
                                    .{" "}
                                    <button type="button" onClick={closeRedeem} className="text-primary hover:underline">Change plan</button>
                                </p>
                            )}

                            {redeemType === "whatsapp" ? (
                                <Card className="relative overflow-hidden border border-border/40 rounded p-5">
                                    <WhatsAppCreditsPurchase />
                                </Card>
                            ) : (
                                <>
                                    <div className="bg-card/50 backdrop-blur-sm border border-border/40 rounded p-4 relative">
                                        <div className="flex items-center justify-between relative px-2">
                                            <div className="absolute left-6 right-6 top-4 h-[2px] bg-muted z-0" />
                                            <div
                                                className="absolute left-6 top-4 h-[2px] bg-primary transition-all duration-500 ease-in-out z-0"
                                                style={{ width: step === 1 ? "0%" : "calc(100% - 3rem)" }}
                                            />
                                            {stepDot(1, "Amount")}
                                            {stepDot(2, "Payment")}
                                        </div>
                                    </div>

                                    <Card className="relative overflow-hidden border border-border/40 rounded p-5 min-h-[300px] flex flex-col justify-between">
                                        <AnimatePresence mode="wait" custom={direction}>
                                            {step === 1 && (
                                                <motion.div
                                                    key="step1"
                                                    custom={direction}
                                                    variants={slideVariants}
                                                    initial="enter"
                                                    animate="center"
                                                    exit="exit"
                                                    className="space-y-5 flex-1 flex flex-col justify-between"
                                                >
                                                    <div className="space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <h2 className="text-base font-bold text-foreground">Buy SMS Bundle</h2>
                                                                <p className="text-[11px] text-muted-foreground">Select amount to buy credits</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-bold">Wallet</span>
                                                                <span className="text-xs font-black text-foreground bg-secondary/50 px-2 py-1 rounded">
                                                                    {isWalletLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : `${walletBalance.toLocaleString()} UGX`}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1.5 pt-2">
                                                            <Label htmlFor="custom-amount" className="text-xs font-bold text-muted-foreground">Amount (UGX)</Label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground">UGX</span>
                                                                <Input
                                                                    id="custom-amount"
                                                                    inputMode="numeric"
                                                                    placeholder="e.g. 35000"
                                                                    value={customAmount}
                                                                    onChange={(e) => setCustomAmount(e.target.value.replace(/[^0-9]/g, ""))}
                                                                    className="pl-11 h-11 text-sm font-bold bg-muted/20 border-border/40 focus-visible:ring-primary"
                                                                />
                                                            </div>
                                                        </div>

                                                        {customNumeric > 0 && (
                                                            <div className="bg-muted/30 border border-border/10 rounded p-4 space-y-2.5 transition-all">
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-muted-foreground font-medium">Selected Amount</span>
                                                                    <span className="font-bold text-foreground">
                                                                        {customNumeric.toLocaleString()} UGX
                                                                        <span className="font-medium text-muted-foreground"> ≈ {formatUsd(customNumeric)}</span>
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-muted-foreground font-medium">
                                                                        {billingSummary?.plan.sms_price_ugx ? `${billingSummary.plan.name} plan rate` : "Volume Rate"}
                                                                    </span>
                                                                    <span className="font-bold text-foreground">{customRate} UGX / SMS</span>
                                                                </div>
                                                                {bonusWhatsApp > 0 && (
                                                                    <div className="flex justify-between text-xs">
                                                                        <span className="text-muted-foreground font-medium">Bonus WhatsApp messages</span>
                                                                        <span className="font-bold text-emerald-600">+{bonusWhatsApp.toLocaleString()}</span>
                                                                    </div>
                                                                )}
                                                                <div className="h-px bg-border/20 my-1" />
                                                                <div className="flex justify-between items-center text-xs">
                                                                    <span className="font-bold text-foreground">Estimated SMS Credits</span>
                                                                    <span className="font-black text-primary text-base flex items-center gap-1">
                                                                        <Coins className="w-4 h-4 text-amber-500" />
                                                                        {customSmsCount.toLocaleString()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="pt-4 border-t border-border/10">
                                                        <Button
                                                            type="button"
                                                            onClick={() => changeStep(2)}
                                                            disabled={!amountValid}
                                                            className="w-full h-11 text-xs font-bold gap-1.5"
                                                        >
                                                            Next: Payment
                                                            <ArrowRight className="w-3.5 h-3.5" />
                                                        </Button>
                                                        {customNumeric > 0 && !amountValid && (
                                                            <p className="text-[10px] text-rose-500 font-semibold text-center mt-2">
                                                                {customNumeric < MIN_TOPUP
                                                                    ? `Minimum topup amount is ${MIN_TOPUP.toLocaleString()} UGX.`
                                                                    : `Maximum topup amount is ${MAX_TOPUP.toLocaleString()} UGX.`}
                                                            </p>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}

                                            {step === 2 && (
                                                <motion.div
                                                    key="step2"
                                                    custom={direction}
                                                    variants={slideVariants}
                                                    initial="enter"
                                                    animate="center"
                                                    exit="exit"
                                                    className="space-y-5 flex-1 flex flex-col justify-between"
                                                >
                                                    <div className="space-y-4">
                                                        <div>
                                                            <h2 className="text-base font-bold text-foreground">Payment</h2>
                                                            <p className="text-[11px] text-muted-foreground">
                                                                {customNumeric.toLocaleString()} UGX ≈ {formatUsd(customNumeric)} for {customSmsCount.toLocaleString()} SMS
                                                            </p>
                                                        </div>
                                                        <PaymentMethodPicker value={payMethod} onChange={setPayMethod} />
                                                    </div>

                                                    <div className="pt-4 border-t border-border/10 flex gap-3">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={() => changeStep(1)}
                                                            className="flex-1 h-11 text-xs font-bold gap-1 border-border/60"
                                                        >
                                                            <ArrowLeft className="w-3.5 h-3.5" />
                                                            Back
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            onClick={continueToCheckout}
                                                            className="flex-[2] h-11 text-xs font-bold gap-1.5"
                                                        >
                                                            Continue
                                                            <ArrowRight className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </Card>
                                </>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </main>
        </div>
    );
}
