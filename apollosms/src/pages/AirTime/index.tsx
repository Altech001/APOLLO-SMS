import { renultApi } from "@/api/apollosms";
import AppHeader from "@/components/Header/AppHeader";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
    AlertCircle,
    ArrowDownLeft,
    Check,
    Coins,
    Loader2,
    Phone,
    ShoppingCart,
    Smartphone,
    Verified,
    Wallet2,
    X,
    Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const CASHBACK_PERCENT = 2;

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 20000, 50000];

const NETWORKS = [
    { id: "mtn", name: "MTN Uganda", prefixes: ["70", "77", "78", "76"], color: "bg-amber-500", textColor: "text-amber-600", bgLight: "bg-amber-50" },
    { id: "airtel", name: "Airtel Uganda", prefixes: ["75", "74", "73", "72", "71"], color: "bg-rose-500", textColor: "text-rose-600", bgLight: "bg-rose-50" },
];

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

const detectNetwork = (phone: string) => {
    const clean = phone.replace(/[^0-9]/g, "");
    let digits = clean;
    if (digits.startsWith("256")) digits = digits.slice(3);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    const prefix = digits.slice(0, 2);
    return NETWORKS.find(n => n.prefixes.includes(prefix)) || null;
};

const formatE164 = (phone: string): string | null => {
    let clean = phone.replace(/[^0-9]/g, "");
    if (clean.startsWith("256") && clean.length === 12) return `+${clean}`;
    if (clean.startsWith("0") && clean.length === 10) return `+256${clean.slice(1)}`;
    if (clean.startsWith("7") && clean.length === 9) return `+256${clean}`;
    return null;
};

interface TxRecord {
    id: string;
    phone: string;
    network: string;
    amount: number;
    cashback: number;
    time: string;
}

export default function AirTimeIndex() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
    useEffect(() => {
        const handler = (e: any) => setSidebarCollapsed(e.detail.collapsed);
        window.addEventListener("sidebar-collapse-change", handler);
        return () => window.removeEventListener("sidebar-collapse-change", handler);
    }, []);

    const [walletBalance, setWalletBalance] = useState(0);
    const [isWalletLoading, setIsWalletLoading] = useState(true);
    const [phone, setPhone] = useState("");
    const [amount, setAmount] = useState("");
    const [sending, setSending] = useState(false);
    const [recentTx, setRecentTx] = useState<TxRecord[]>([]);

    const [purchasingId, setPurchasingId] = useState<string | null>(null);
    const [purchaseStage, setPurchaseStage] = useState<"idle" | "processing" | "success">("idle");

    useEffect(() => {
        let mounted = true;
        setIsWalletLoading(true);
        Promise.all([
            renultApi.wallet.get(),
            renultApi.topups.list({ kind: "airtime" }),
        ])
            .then(([wallet, topups]) => {
                if (!mounted) return;
                setWalletBalance(wallet.cash_balance);
                setRecentTx(topups.slice(0, 10).map((topup) => ({
                    id: topup.id,
                    phone: topup.phone || "-",
                    network: topup.network || "Unknown",
                    amount: topup.amount,
                    cashback: topup.cashback,
                    time: new Date(topup.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
                })));
            })
            .catch((error) => {
                if (mounted) toast.error(error instanceof Error ? error.message : "Unable to load wallet data");
            })
            .finally(() => {
                if (mounted) setIsWalletLoading(false);
            });
        return () => { mounted = false; };
    }, []);

    // Custom bundle state
    const [customAmount, setCustomAmount] = useState("");
    const customNumeric = parseInt(customAmount.replace(/[^0-9]/g, ""), 10) || 0;
    const customRate = useMemo(() => getRateForAmount(customNumeric), [customNumeric]);
    const customSmsCount = customNumeric > 0 ? Math.floor(customNumeric / customRate) : 0;

    const handlePurchase = async (id: string, price: number, smsCount: number) => {
        if (price > walletBalance) { toast.error("Insufficient wallet balance."); return; }
        if (price <= 0) { toast.error("Enter a valid amount."); return; }
        setPurchasingId(id);
        setPurchaseStage("processing");
        try {
            const result = await renultApi.topups.sms({ amount: price, sms_count: smsCount });
            setPurchaseStage("success");
            setWalletBalance(result.wallet.cash_balance);
            window.dispatchEvent(new CustomEvent("renult-wallet-change"));
            toast.success(`${smsCount.toLocaleString()} SMS credits added!`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to buy SMS credits");
        } finally {
            setTimeout(() => { setPurchasingId(null); setPurchaseStage("idle"); }, 1000);
        }
    };

    const numericAmount = parseInt(amount.replace(/[^0-9]/g, ""), 10) || 0;
    const cashbackAmount = Math.floor(numericAmount * (CASHBACK_PERCENT / 100));
    const netDeduction = numericAmount - cashbackAmount;
    const network = detectNetwork(phone);
    const e164 = formatE164(phone);
    const isValid = !!e164 && numericAmount >= 500 && numericAmount <= walletBalance;

    const handlePhoneChange = (val: string) => {
        setPhone(val.replace(/[^0-9]/g, "").slice(0, 12));
    };

    const handleAmountChange = (val: string) => {
        setAmount(val.replace(/[^0-9]/g, ""));
    };

    const handleSend = async () => {
        if (!isValid) return;
        setSending(true);

        try {
            const result = await renultApi.topups.airtime({
                phone: e164!,
                network: network?.name || "Unknown",
                amount: numericAmount,
                cashback: cashbackAmount,
            });
            const tx: TxRecord = {
                id: result.topup.id,
                phone: result.topup.phone || e164!,
                network: result.topup.network || network?.name || "Unknown",
                amount: result.topup.amount,
                cashback: result.topup.cashback,
                time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
            };
            setRecentTx(prev => [tx, ...prev].slice(0, 10));
            setWalletBalance(result.wallet.cash_balance);
            window.dispatchEvent(new CustomEvent("renult-wallet-change"));
            toast.success(`Airtime of UGX ${numericAmount.toLocaleString()} sent! Cashback: UGX ${cashbackAmount.toLocaleString()}`);
            setPhone("");
            setAmount("");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to send airtime");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className={cn("min-h-screen bg-background transition-all duration-300", sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[280px]")}>
            <SEO title="Airtime & Cash Return" />
            <AppHeader />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-foreground sm:text-xl">Airtime & Cash Return</h1>
                        <p className="text-xs text-muted-foreground mt-1">Send airtime to any Ugandan number and earn {CASHBACK_PERCENT}% cashback on every purchase.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Main — Purchase Form */}
                    <div className="lg:col-span-2 space-y-5">
                        <Card className="border-border/20 rounded-none shadow-sm">
                            <CardHeader className="pb-3 border-b border-border/10">
                                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                                    Buy Airtime
                                </CardTitle>
                                <CardDescription className="text-[10px] mt-0.5">Enter recipient number and amount. You earn {CASHBACK_PERCENT}% cashback automatically.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-5 space-y-5">
                                {/* Phone Input */}
                                <div className="space-y-2">
                                    <Label htmlFor="airtime-phone" className="text-xs font-bold text-muted-foreground">Recipient Phone Number</Label>
                                    <div className="relative flex rounded border border-border/50 bg-card overflow-hidden focus-within:ring-1 focus-within:ring-primary transition-all">
                                        <div className="flex items-center gap-1.5 px-3.5 bg-muted/30 border-r border-border/30 select-none">
                                            <span className="text-base">🇺🇬</span>
                                            <span className="text-xs font-black text-muted-foreground">+256</span>
                                        </div>
                                        <Input
                                            id="airtime-phone"
                                            type="tel"
                                            placeholder="772 123 456"
                                            value={phone.replace(/^256/, "").replace(/^0/, "")}
                                            onChange={(e) => handlePhoneChange(e.target.value)}
                                            className="h-11 border-none bg-transparent font-bold text-sm focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none pl-3"
                                            maxLength={10}
                                        />
                                        {network && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                <span className={cn("px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider", network.bgLight, network.textColor)}>
                                                    {network.id === "mtn" ? "MTN" : "Airtel"}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Amount Input */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="airtime-amount" className="text-xs font-bold text-muted-foreground">Airtime Amount</Label>
                                        <span className="text-[10px] text-muted-foreground font-semibold">Min: 500 UGX</span>
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground">UGX</span>
                                        <Input
                                            id="airtime-amount"
                                            inputMode="numeric"
                                            placeholder="0"
                                            value={amount}
                                            onChange={(e) => handleAmountChange(e.target.value)}
                                            className="pl-11 h-11 text-base font-black "
                                        />
                                    </div>

                                    {/* Quick Amount Chips */}
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {QUICK_AMOUNTS.map(qa => (
                                            <button
                                                key={qa}
                                                type="button"
                                                onClick={() => setAmount(qa.toString())}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-md text-[11px] font-bold border transition-all",
                                                    numericAmount === qa
                                                        ? "bg-primary text-white border-primary"
                                                        : "bg-card border-border/60 text-foreground hover:bg-muted/20"
                                                )}
                                            >
                                                {qa.toLocaleString()}
                                            </button>
                                        ))}
                                    </div>

                                    {numericAmount > walletBalance && (
                                        <p className="text-[11px] text-rose-500 font-semibold flex items-center gap-1 mt-1">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            Amount exceeds your available balance
                                        </p>
                                    )}
                                </div>

                                {/* Cost Breakdown */}
                                {numericAmount >= 500 && (
                                    <div className="p-4 bg-primary/10 border border-primary/30 rounded space-y-2.5 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Airtime value</span>
                                            <span className="font-bold text-foreground ">{numericAmount.toLocaleString()} UGX</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Cashback ({CASHBACK_PERCENT}%)</span>
                                            <span className="font-bold text-emerald-600 ">+ {cashbackAmount.toLocaleString()} UGX</span>
                                        </div>
                                        <div className="border-t border-border/20 pt-2 flex justify-between text-sm">
                                            <span className="font-bold text-foreground">Net wallet deduction</span>
                                            <span className="font-black text-foreground ">{netDeduction.toLocaleString()} UGX</span>
                                        </div>
                                    </div>
                                )}

                                {/* Send Button */}
                                <Button
                                    onClick={handleSend}
                                    disabled={!isValid || sending || isWalletLoading}
                                    className="w-full h-11 text-sm font-bold gap-2"
                                >
                                    {isWalletLoading ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Loading Wallet...</>
                                    ) : sending ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Sending Airtime...</>
                                    ) : (
                                        <><Zap className="w-4 h-4" /> Send Airtime {numericAmount > 0 ? `(UGX ${numericAmount.toLocaleString()})` : ""}</>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Aside — Cashback Info + Recent Transactions */}
                    <div className="lg:col-span-1 space-y-5">
                        {/* Cashback Info Card */}
                        <Card className="border-border/10 shadow-none rounded bg-gradient-to-br from-emerald-500/5 to-primary/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-bold flex items-center gap-1.5 text-emerald-600">
                                    <Coins className="w-3.5 h-3.5" />
                                    2% Cash Return
                                </CardTitle>
                                <CardDescription className="text-[10px] mt-0.5">Get instant cashback on all airtime recharges</CardDescription>
                            </CardHeader>
                            <CardContent className="px-5 pb-4 pt-1 space-y-2">
                                <p className="text-xs text-muted-foreground leading-normal">
                                    Every time you buy airtime for MTN or Airtel Uganda, you instantly receive <strong className="text-foreground">2% cashback</strong> credited back to your wallet.
                                </p>
                            </CardContent>
                        </Card>

                        {/* Aside — Custom Bundle Calculator */}
                        <Card className="border-border/10 shadow-none rounded">
                            <CardHeader className="pb-3 border-b border-border/10">
                                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                                    Cash Return
                                </CardTitle>
                                <CardDescription className="text-[10px] mt-0.5">Return some Cash Back to your Mobile Money.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-5 space-y-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="custom-amount" className="text-xs font-semibold">Amount (UGX)</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground">UGX</span>
                                        <Input
                                            id="custom-amount"
                                            inputMode="numeric"
                                            placeholder="e.g. 35000"
                                            value={customAmount}
                                            onChange={(e) => setCustomAmount(e.target.value.replace(/[^0-9]/g, ""))}
                                            className="pl-11 h-10 text-sm font-bold "
                                        />
                                    </div>
                                </div>

                                {/* Live Calculator Result */}
                                {customNumeric > 0 && (
                                    <div className="space-y-3 pt-3 border-t border-border/10">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Amount</span>
                                            <span className="font-bold text-foreground ">{customNumeric.toLocaleString()} UGX</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Rate (per SMS)</span>
                                            <span className="font-bold text-foreground ">{customRate} UGX</span>
                                        </div>
                                        <div className="flex justify-between text-xs pt-2 border-t border-border/10">
                                            <span className="font-bold text-foreground">SMS Credits</span>
                                            <span className="font-black text-primary text-sm ">{customSmsCount.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="font-bold text-foreground">Cost per message</span>
                                            <span className="font-black text-foreground ">{customRate} UGX</span>
                                        </div>

                                        <Button
                                            onClick={() => handlePurchase("custom", customNumeric, customSmsCount)}
                                            disabled={isWalletLoading || customNumeric > walletBalance || customNumeric <= 0 || !!purchasingId}
                                            className="w-full h-10 text-xs font-bold gap-1.5 mt-2"
                                        >
                                            {purchasingId === "custom" && purchaseStage === "processing" ? (
                                                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...</>
                                            ) : purchasingId === "custom" && purchaseStage === "success" ? (
                                                <><Check className="w-3.5 h-3.5" /> Purchased!</>
                                            ) : (
                                                <><ShoppingCart className="w-3.5 h-3.5" /> Buy Custom Bundle</>
                                            )}
                                        </Button>

                                        {customNumeric > walletBalance && (
                                            <p className="text-[10px] text-rose-500 font-semibold text-center">Insufficient balance</p>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Recent Transactions Card */}
                        {recentTx.length > 0 && (
                            <Card className="border-border/10 shadow-none rounded">
                                <CardHeader className="pb-3 border-b border-border/10">
                                    <CardTitle className="text-xs font-bold flex items-center gap-1.5">
                                        <ArrowDownLeft className="w-3.5 h-3.5 text-primary" />
                                        Recent Transactions
                                    </CardTitle>
                                    <CardDescription className="text-[10px] mt-0.5">Your latest airtime purchases</CardDescription>
                                </CardHeader>
                                <CardContent className="p-0 divide-y divide-border/10">
                                    {recentTx.map(tx => (
                                        <div key={tx.id} className="p-3.5 flex justify-between items-center text-xs hover:bg-muted/5 transition-colors">
                                            <div className="space-y-0.5">
                                                <p className="font-bold text-foreground">{tx.phone}</p>
                                                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                    <span className={cn(
                                                        "px-1 py-0.2 rounded-[3px] text-[8px] font-black uppercase tracking-wider",
                                                        tx.network.toLowerCase().includes("mtn") ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600"
                                                    )}>
                                                        {tx.network}
                                                    </span>
                                                    • {tx.time}
                                                </p>
                                            </div>
                                            <div className="text-right space-y-0.5">
                                                <p className="font-black text-foreground ">{tx.amount.toLocaleString()} UGX</p>
                                                <p className="text-[10px] text-emerald-600 font-bold ">+{tx.cashback.toLocaleString()} UGX</p>
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
