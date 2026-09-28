import { renultApi, apollosmsApi } from "@/api/apollosms";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useBillingSummary } from "@/hooks/use-billing-summary";
import BillingPlans, { RedeemType } from "@/components/billing/BillingPlans";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import WhatsAppCreditsPurchase from "@/components/billing/WhatsAppCreditsPurchase";
import { isPaymentComplete, isPaymentFailed, normalizePaymentStatus } from "@/lib/payment-status";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, Variants } from "framer-motion";
import {
    ArrowLeft,
    ArrowRight,
    ArrowUpRight,
    Check,
    Coins,
    Loader2,
    MessageCircle,
    MessageSquare,
    Phone,
    ShoppingCart,
    Verified
} from "lucide-react";
import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

const TIERS = [
    { min: 0, max: 20000, rate: 32 },
    { min: 20001, max: 100000, rate: 30 },
    { min: 100001, max: 200000, rate: 28 },
    { min: 200001, max: Infinity, rate: 25 },
];

const getRateForAmount = (amount: number) => {
    const tier = TIERS.find(t => amount >= t.min && amount <= t.max);
    return tier?.rate ?? 32;
};

const formatUgandanPhone = (phone: string) => {
    let clean = phone.replace(/[^0-9+]/g, "").trim();
    if (clean.startsWith("0")) {
        clean = "+256" + clean.slice(1);
    } else if (clean.startsWith("256") && !clean.startsWith("+")) {
        clean = "+" + clean;
    }
    return clean;
};

export default function Withdrawal() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: any) => setSidebarCollapsed(e.detail.collapsed);
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    const { summary: billingSummary } = useBillingSummary();
    // The redeem dialog is driven by the URL (?redeem=sms|whatsapp) so other pages can open it directly.
    const [searchParams, setSearchParams] = useSearchParams();
    const redeemParam = searchParams.get("redeem");
    const isRedeemOpen = redeemParam === "sms" || redeemParam === "whatsapp";
    const redeemType: RedeemType = redeemParam === "whatsapp" ? "whatsapp" : "sms";
    const setRedeemType = (type: RedeemType) => setSearchParams({ redeem: type }, { replace: true });
    const [walletBalance, setWalletBalance] = useState(0);
    const [topupPhone, setTopupPhone] = useState(user?.phone_number || "");
    const [isWalletLoading, setIsWalletLoading] = useState(true);
    const [purchasingId, setPurchasingId] = useState<string | null>(null);
    const [purchaseStage, setPurchaseStage] = useState<"idle" | "processing" | "success">("idle");
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // Polling and real payment states
    const [paymentReference, setPaymentReference] = useState<string | null>(null);
    const [paymentStatus, setPaymentStatus] = useState<string>("pending");
    const [pollingSeconds, setPollingSeconds] = useState<number>(0);

    const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pollingActiveRef = useRef(false);

    const stopPolling = () => {
        pollingActiveRef.current = false;
        if (pollIntervalRef.current) {
            clearTimeout(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
    };

    // Clean up timers on unmount
    useEffect(() => {
        return () => stopPolling();
    }, []);

    const completePurchase = async (smsCount: number) => {
        stopPolling();
        setPurchaseStage("success");
        toast.success(`${smsCount.toLocaleString()} SMS credits added!`);

        try {
            await apollosmsApi.auth.me();
            const wallet = await renultApi.wallet.get();
            setWalletBalance(wallet.cash_balance);
            window.dispatchEvent(new CustomEvent("renult-wallet-change"));
        } catch {
            // Wallet refresh is best-effort; payment already succeeded.
        }

        setStep(3);
        setPurchasingId(null);
        setPurchaseStage("idle");
        setPaymentReference(null);
        setPaymentStatus("completed");
        setPollingSeconds(0);
    };

    const failPurchase = (message: string) => {
        stopPolling();
        toast.error(message);
        setPurchaseStage("idle");
        setPurchasingId(null);
        setPaymentReference(null);
        setPaymentStatus("failed");
        setPollingSeconds(0);
    };

    const startPaymentPolling = (reference: string, smsCount: number) => {
        stopPolling();
        pollingActiveRef.current = true;

        setPollingSeconds(0);
        timerIntervalRef.current = setInterval(() => {
            setPollingSeconds((prev) => prev + 1);
        }, 1000);

        let attempts = 0;
        const maxAttempts = 60;
        let consecutiveErrors = 0;

        const poll = async () => {
            if (!pollingActiveRef.current) return;

            attempts += 1;
            try {
                const tx = await apollosmsApi.payments.getCollection(reference, { sync: true });
                consecutiveErrors = 0;
                setPaymentStatus(normalizePaymentStatus(tx.status));

                if (isPaymentComplete(tx)) {
                    await completePurchase(smsCount);
                    return;
                }

                if (isPaymentFailed(tx)) {
                    const reason = tx.description?.includes("Auto-failed") || tx.description?.includes("failed")
                        ? "Payment failed — insufficient funds or declined by mobile money."
                        : "Payment failed or was declined.";
                    failPurchase(reason);
                    return;
                }
            } catch (err) {
                consecutiveErrors += 1;
                console.error("Collection status poll failed:", err);
                if (consecutiveErrors >= 3) {
                    toast.error(err instanceof Error ? err.message : "Unable to check payment status");
                }
            }

            if (!pollingActiveRef.current) return;

            if (attempts >= maxAttempts) {
                failPurchase("Payment authorization timed out. Please try again.");
                return;
            }

            pollIntervalRef.current = setTimeout(poll, 2000);
        };

        void poll();
    };

    useEffect(() => {
        if (!topupPhone && user?.phone_number) setTopupPhone(user.phone_number);
    }, [topupPhone, user?.phone_number]);

    // Custom bundle state
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

    useEffect(() => {
        let mounted = true;
        setIsWalletLoading(true);
        renultApi.wallet.get()
            .then((wallet) => {
                if (!mounted) return;
                setWalletBalance(wallet.cash_balance);
            })
            .catch((error) => {
                toast.error(error instanceof Error ? error.message : "Unable to load wallet");
            })
            .finally(() => {
                if (mounted) setIsWalletLoading(false);
            });
        return () => { mounted = false; };
    }, []);

    const handlePurchase = async () => {
        if (customNumeric < 500) {
            toast.error("Minimum topup amount is 500 UGX.");
            return;
        }
        if (customNumeric > 10000000) {
            toast.error("Maximum topup amount is 10,000,000 UGX.");
            return;
        }
        if (!topupPhone.trim()) {
            toast.error("Please enter a valid phone number.");
            return;
        }

        const formattedPhone = formatUgandanPhone(topupPhone.trim());

        setPurchasingId("custom");
        setPurchaseStage("processing");
        setPaymentStatus("pending");
        setPollingSeconds(0);

        try {
            // Initiate the collection payment
            const result = await apollosmsApi.payments.createCollection({
                amount_ugx: customNumeric,
                phone_number: formattedPhone,
                method: "mobile_money",
                description: `Buy ${customSmsCount} SMS credits`
            });

            const ref = result.reference;
            setPaymentReference(ref);
            setPaymentStatus(normalizePaymentStatus(result.status));
            startPaymentPolling(ref, customSmsCount);

        } catch (error) {
            stopPolling();
            toast.error(error instanceof Error ? error.message : "Unable to buy SMS credits");
            setPurchasingId(null);
            setPurchaseStage("idle");
            setPaymentReference(null);
            setPaymentStatus("pending");
            setPollingSeconds(0);
        }
    };

    const handleCancelPayment = () => {
        stopPolling();
        setPurchaseStage("idle");
        setPurchasingId(null);
        setPaymentReference(null);
        setPaymentStatus("pending");
        setPollingSeconds(0);
        toast.info("Payment cancelled.");
    };

    const handleReset = () => {
        setCustomAmount("");
        setStep(1);
    };

    // Anim variants for slides
    const slideVariants: Variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 100 : -100,
            opacity: 0
        }),
        center: {
            x: 0,
            opacity: 1,
            transition: {
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 }
            }
        },
        exit: (direction: number) => ({
            x: direction < 0 ? 100 : -100,
            opacity: 0,
            transition: {
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 }
            }
        })
    };

    const [direction, setDirection] = useState(1);

    const changeStep = (newStep: 1 | 2 | 3) => {
        setDirection(newStep > step ? 1 : -1);
        setStep(newStep);
    };

    const closeRedeem = () => {
        if (purchaseStage === "processing") {
            if (!window.confirm("Stop waiting for this payment? If you approve it on your phone, your credits are still added.")) return;
            handleCancelPayment();
        }
        if (step === 3) handleReset();
        setSearchParams({}, { replace: true });
    };

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
                            <DialogDescription className="text-xs">Buy SMS or WhatsApp messages with mobile money.</DialogDescription>
                        </DialogHeader>
                <div className="w-full space-y-5">
                    {/* Redeem type switch */}
                    <div className="grid grid-cols-2 gap-1 p-1 rounded border border-border/40 bg-card/50 backdrop-blur-sm">
                        {([
                            { value: "sms", label: "Buy SMS", icon: <MessageSquare className="w-4 h-4" /> },
                            { value: "whatsapp", label: "Buy WhatsApp", icon: <MessageCircle className="w-4 h-4" /> },
                        ] as const).map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setRedeemType(option.value)}
                                disabled={purchaseStage === "processing"}
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
                    {/* Timeline progress indicator */}
                    <div className="bg-card/50 backdrop-blur-sm border border-border/40 rounded p-4  relative">
                        <div className="flex items-center justify-between relative px-2">
                            {/* Connector Line Background */}
                            <div className="absolute left-6 right-6 top-4 h-[2px] bg-muted z-0" />

                            {/* Active Line Progress */}
                            <div
                                className="absolute left-6 top-4 h-[2px] bg-primary transition-all duration-500 ease-in-out z-0"
                                style={{
                                    width: step === 1 ? '0%' : step === 2 ? '50%' : '100%'
                                }}
                            />

                            {/* Step 1 Indicator */}
                            <div className="flex flex-col items-center gap-1.5 z-10">
                                <button
                                    onClick={() => step > 1 && step !== 3 && changeStep(1)}
                                    disabled={step === 3 || step === 1}
                                    className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 border-2 cursor-pointer disabled:cursor-default",
                                        step === 1 ? "bg-primary border-primary text-primary-foreground   scale-105" :
                                            step > 1 ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border text-muted-foreground"
                                    )}
                                >
                                    {step > 1 ? <Check className="w-4 h-4 stroke-[3]" /> : "1"}
                                </button>
                                <span className={cn("text-[10px] font-bold transition-colors duration-300", step === 1 ? "text-primary" : "text-muted-foreground")}>Amount</span>
                            </div>

                            {/* Step 2 Indicator */}
                            <div className="flex flex-col items-center gap-1.5 z-10">
                                <button
                                    onClick={() => step > 2 && step !== 3 && changeStep(2)}
                                    disabled={step === 3 || step <= 2}
                                    className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 border-2 cursor-pointer disabled:cursor-default",
                                        step === 2 ? "bg-primary border-primary text-primary-foreground   scale-105" :
                                            step > 2 ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border text-muted-foreground"
                                    )}
                                >
                                    {step > 2 ? <Check className="w-4 h-4 stroke-[3]" /> : "2"}
                                </button>
                                <span className={cn("text-[10px] font-bold transition-colors duration-300", step === 2 ? "text-primary" : "text-muted-foreground")}>Recipient</span>
                            </div>

                            {/* Step 3 Indicator */}
                            <div className="flex flex-col items-center gap-1.5 z-10">
                                <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 border-2",
                                    step === 3 ? "bg-primary border-primary text-primary-foreground   scale-105" : "bg-card border-border text-muted-foreground"
                                )}>
                                    3
                                </div>
                                <span className={cn("text-[10px] font-bold transition-colors duration-300", step === 3 ? "text-primary" : "text-muted-foreground")}>Success</span>
                            </div>
                        </div>
                    </div>

                    {/* Main card wizard body */}
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
                                            <Label htmlFor="custom-amount" className="text-xs font-bold text-muted-foreground">Or Enter Custom Amount (UGX)</Label>
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

                                        {/* Dynamic rate details card */}
                                        {customNumeric > 0 && (
                                            <div className="bg-muted/30 border border-border/10 rounded p-4 space-y-2.5 transition-all">
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-muted-foreground font-medium">Selected Amount</span>
                                                    <span className="font-bold text-foreground">{customNumeric.toLocaleString()} UGX</span>
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
                                                        <Coins className="w-4 h-4 text-amber-500 animate-bounce" />
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
                                            disabled={customNumeric < 500 || customNumeric > 10000000}
                                            className="w-full h-11 text-xs font-bold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/95 transition-all"
                                        >
                                            Next: Recipient Details
                                            <ArrowRight className="w-3.5 h-3.5" />
                                        </Button>
                                        {customNumeric > 0 && customNumeric < 500 && (
                                            <p className="text-[10px] text-rose-500 font-semibold text-center mt-2">
                                                Minimum topup amount is 500 UGX.
                                            </p>
                                        )}
                                        {customNumeric > 10000000 && (
                                            <p className="text-[10px] text-rose-500 font-semibold text-center mt-2">
                                                Maximum topup amount is 10,000,000 UGX.
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
                                    {purchaseStage === "processing" ? (
                                        <div className="space-y-6 flex-1 flex flex-col justify-center items-center py-6">
                                            <div className="relative">
                                                <div className="absolute inset-0 bg-primary/20 rounded-full blur-md animate-pulse" />
                                                <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center relative">
                                                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                                </div>
                                            </div>
                                            <div className="space-y-2 text-center max-w-[280px]">
                                                <h3 className="text-sm font-bold text-foreground">Waiting for MM PIN...</h3>
                                                <p className="text-[11px] text-muted-foreground leading-normal">
                                                    We sent a Mobile Money PIN prompt of <strong className="text-foreground">{customNumeric.toLocaleString()} UGX</strong> to <strong className="text-foreground">{topupPhone}</strong>.
                                                </p>
                                                <p className="text-[10px] text-amber-500 font-semibold bg-amber-500/10 px-2 py-1 rounded inline-block mt-1 animate-pulse">
                                                    Please authorize the payment on your device.
                                                </p>
                                            </div>
                                            <div className="w-full bg-muted/20 border border-border/10 rounded p-3 text-[10px] space-y-1.5 max-w-[320px]">
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground font-medium">Reference</span>
                                                    <span className="font-semibold font-mono text-foreground truncate max-w-[120px]">{paymentReference || "Generating..."}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground font-medium">Payment Status</span>
                                                    <span className="font-bold text-primary uppercase">{paymentStatus}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground font-medium">Time Elapsed</span>
                                                    <span className="font-semibold text-foreground">{pollingSeconds}s</span>
                                                </div>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                onClick={handleCancelPayment}
                                                className="h-9 text-xs font-bold px-4 bg-rose-600 hover:bg-rose-700 text-white"
                                            >
                                                Cancel Payment
                                            </Button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="space-y-4">
                                                <div>
                                                    <h2 className="text-base font-bold text-foreground">Recipient Details</h2>
                                                    <p className="text-[11px] text-muted-foreground">Specify the phone number to top up</p>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between items-center">
                                                        <Label htmlFor="topup-phone" className="text-xs font-bold text-muted-foreground">Phone Number</Label>
                                                        {user?.phone_number && topupPhone !== user.phone_number && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setTopupPhone(user.phone_number || "")}
                                                                className="text-[10px] font-bold text-primary hover:underline"
                                                            >
                                                                Use Account Phone
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"><Phone className="w-3.5 h-3.5" /></span>
                                                        <Input
                                                            id="topup-phone"
                                                            value={topupPhone}
                                                            onChange={(e) => setTopupPhone(e.target.value)}
                                                            placeholder="+256..."
                                                            className="pl-9 h-11 text-sm bg-muted/20 border-border/40 focus-visible:ring-primary font-bold"
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground">Enter number with country code, e.g. +256701XXXXXX</p>
                                                </div>
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
                                                    onClick={handlePurchase}
                                                    disabled={!topupPhone.trim()}
                                                    className="flex-[2] h-11 text-xs font-bold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/95 transition-all"
                                                >
                                                    <ShoppingCart className="w-3.5 h-3.5" /> Confirm & Pay
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </motion.div>
                            )}

                            {step === 3 && (
                                <motion.div
                                    key="step3"
                                    custom={direction}
                                    variants={slideVariants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    className="space-y-6 flex-1 flex flex-col justify-between items-center text-center py-4"
                                >
                                    <div className="space-y-4 w-full flex flex-col items-center">
                                        {/* Animated outer check ring */}
                                        <div className="relative">
                                            <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-md animate-ping" />
                                            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center relative">
                                                <Verified className="w-10 h-10 text-emerald-500" />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <h2 className="text-lg font-black text-foreground">Purchase Successful!</h2>
                                            <p className="text-[11px] text-muted-foreground">Your credits have been added successfully</p>
                                        </div>

                                        {/* Receipt/Invoice card */}
                                        <div className="w-full bg-muted/40 border border-border/10 rounded p-4 text-xs space-y-2.5">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">SMS Credits Added</span>
                                                <span className="font-black text-foreground">{customSmsCount.toLocaleString()} SMS</span>
                                            </div>
                                            {bonusWhatsApp > 0 && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Bonus WhatsApp</span>
                                                    <span className="font-black text-emerald-600">+{bonusWhatsApp.toLocaleString()}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Amount Debited</span>
                                                <span className="font-bold text-foreground">{customNumeric.toLocaleString()} UGX</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Recipient Mobile</span>
                                                <span className="font-semibold text-foreground">{topupPhone}</span>
                                            </div>
                                            <div className="h-px bg-border/20 my-1" />
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Status</span>
                                                <span className="font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded text-[10px]">COMPLETED</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="w-full pt-4 border-t border-border/10 flex flex-col sm:flex-row gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => navigate("/settings/billing")}
                                            className="w-full sm:flex-1 h-10 text-xs font-bold gap-1.5 border-border/60"
                                        >
                                            View Billing History
                                            <ArrowUpRight className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={handleReset}
                                            className="w-full sm:flex-1 h-10 text-xs font-bold gap-1.5"
                                        >
                                            Buy More
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
