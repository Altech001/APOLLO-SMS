import { renultApi } from "@/api/apollosms";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, Variants } from "framer-motion";
import {
    ArrowLeft,
    ArrowRight,
    ArrowUpRight,
    Check,
    Coins,
    Loader2,
    Phone,
    ShoppingCart,
    Verified
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

export default function Withdrawal() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");

    useEffect(() => {
        const handler = (e: any) => setSidebarCollapsed(e.detail.collapsed);
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    const [walletBalance, setWalletBalance] = useState(0);
    const [topupPhone, setTopupPhone] = useState(user?.phone_number || "");
    const [isWalletLoading, setIsWalletLoading] = useState(true);
    const [purchasingId, setPurchasingId] = useState<string | null>(null);
    const [purchaseStage, setPurchaseStage] = useState<"idle" | "processing" | "success">("idle");
    const [step, setStep] = useState<1 | 2 | 3>(1);

    useEffect(() => {
        if (!topupPhone && user?.phone_number) setTopupPhone(user.phone_number);
    }, [topupPhone, user?.phone_number]);

    // Custom bundle state
    const [customAmount, setCustomAmount] = useState("");
    const customNumeric = parseInt(customAmount.replace(/[^0-9]/g, ""), 10) || 0;
    const customRate = useMemo(() => getRateForAmount(customNumeric), [customNumeric]);
    const customSmsCount = customNumeric > 0 ? Math.floor(customNumeric / customRate) : 0;

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
        if (customNumeric > walletBalance) {
            toast.error("Insufficient wallet balance.");
            return;
        }
        if (customNumeric <= 0) {
            toast.error("Enter a valid amount.");
            return;
        }
        if (!topupPhone.trim()) {
            toast.error("Please enter a valid phone number.");
            return;
        }

        setPurchasingId("custom");
        setPurchaseStage("processing");
        try {
            const result = await renultApi.topups.sms({
                amount: customNumeric,
                sms_count: customSmsCount,
                phone: topupPhone.trim() || null
            });
            setPurchaseStage("success");
            setWalletBalance(result.wallet.cash_balance);
            window.dispatchEvent(new CustomEvent("renult-wallet-change"));
            toast.success(`${customSmsCount.toLocaleString()} SMS credits added!`);

            // Go to success step
            setStep(3);
            setPurchasingId(null);
            setPurchaseStage("idle");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to buy SMS credits");
            setPurchasingId(null);
            setPurchaseStage("idle");
        }
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

    return (
        <div className={cn("min-h-screen bg-background transition-all duration-300 flex flex-col", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}>
            <SEO title="Buy SMS Bundles" />
            <AppHeader />

            <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 relative overflow-hidden">
                {/* Background decorative glows */}
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="w-full max-w-md z-10 space-y-6">
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
                    <Card className="relative overflow-hidden border border-border/40 rounded  p-6 min-h-[380px] flex flex-col justify-between">
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
                                                    <span className="text-muted-foreground font-medium">Volume Rate</span>
                                                    <span className="font-bold text-foreground">{customRate} UGX / SMS</span>
                                                </div>
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
                                            disabled={customNumeric <= 0 || customNumeric > walletBalance}
                                            className="w-full h-11 text-xs font-bold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/95 transition-all"
                                        >
                                            Next: Recipient Details
                                            <ArrowRight className="w-3.5 h-3.5" />
                                        </Button>
                                        {customNumeric > walletBalance && (
                                            <p className="text-[10px] text-rose-500 font-semibold text-center mt-2">
                                                Insufficient wallet balance.
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
                                            disabled={!topupPhone.trim() || purchaseStage === "processing"}
                                            className="flex-[2] h-11 text-xs font-bold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/95 transition-all"
                                        >
                                            {purchaseStage === "processing" ? (
                                                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...</>
                                            ) : (
                                                <><ShoppingCart className="w-3.5 h-3.5" /> Confirm & Pay</>
                                            )}
                                        </Button>
                                    </div>
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
                                            onClick={() => navigate("/sales")}
                                            className="w-full sm:flex-1 h-10 text-xs font-bold gap-1.5 border-border/60"
                                        >
                                            View Logs
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
                </div>
            </main>
        </div>
    );
}
