import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifyBillingChange } from "@/hooks/use-billing-summary";
import { formatUgandanPhone, useCollectionPayment } from "@/hooks/use-collection-payment";
import { useUsdRate } from "@/hooks/use-usd-rate";
import { useAuth } from "@/lib/auth";
import { startCheckoutCollection, useCheckoutOrder } from "@/lib/checkout";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, Phone, Smartphone, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import CheckoutShell from "./CheckoutShell";

type Network = "mtn" | "airtel" | null;

const NETWORK_PREFIXES: Record<Exclude<Network, null>, string[]> = {
    mtn: ["76", "77", "78", "79"],
    airtel: ["70", "74", "75"],
};

const detectNetwork = (formatted: string): Network => {
    const prefix = formatted.startsWith("+256") ? formatted.slice(4, 6) : "";
    if (NETWORK_PREFIXES.mtn.includes(prefix)) return "mtn";
    if (NETWORK_PREFIXES.airtel.includes(prefix)) return "airtel";
    return null;
};

const isValidUgandanNumber = (formatted: string) => /^\+256\d{9}$/.test(formatted);

export default function MobileMoneyCheckout() {
    const navigate = useNavigate();
    const order = useCheckoutOrder();
    const { user } = useAuth();
    const { formatUsd } = useUsdRate();
    const [phone, setPhone] = useState(user?.phone_number || "");
    const payment = useCollectionPayment(() => notifyBillingChange());

    useEffect(() => {
        if (!phone && user?.phone_number) setPhone(user.phone_number);
    }, [phone, user?.phone_number]);

    const formatted = formatUgandanPhone(phone.trim());
    const network = detectNetwork(formatted);
    const valid = isValidUgandanNumber(formatted);
    const amount = `UGX ${order.amountUgx.toLocaleString()}`;

    const handlePay = () => {
        if (!valid) return;
        payment.start(() => startCheckoutCollection(order, "mobile_money", formatted));
    };

    const cancelWaiting = () => {
        if (window.confirm("Stop waiting for this payment? If you approve it on your phone, your account still updates.")) payment.reset();
    };

    const body = (() => {
        if (payment.stage === "completed") {
            return (
                <div className="py-6 text-center space-y-4">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
                    <div className="space-y-1">
                        <p className="text-base font-semibold">Payment received</p>
                        <p className="text-xs text-muted-foreground">{amount} from {formatted}. Your account has been updated.</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 h-10 text-xs" onClick={() => navigate("/settings/billing")}>Billing history</Button>
                        <Button className="flex-1 h-10 text-xs" onClick={() => navigate("/sms-tp")}>Done</Button>
                    </div>
                </div>
            );
        }

        if (payment.stage === "starting" || payment.stage === "waiting") {
            return (
                <div className="py-6 text-center space-y-4">
                    <div className="relative w-14 h-14 mx-auto">
                        <div className="absolute inset-0 rounded-full bg-primary/15 animate-ping" />
                        <div className="relative w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                            <Smartphone className="w-6 h-6 text-primary" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-base font-semibold">{payment.stage === "starting" ? "Sending the prompt…" : "Check your phone"}</p>
                        <p className="text-xs text-muted-foreground">
                            Enter your Mobile Money PIN to approve <b className="text-foreground">{amount}</b> on <b className="text-foreground">{formatted}</b>.
                        </p>
                    </div>
                    <div className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Status: {payment.status}
                    </div>
                    {payment.collection?.reference && (
                        <p className="text-[10px] font-mono text-muted-foreground break-all">{payment.collection.reference}</p>
                    )}
                    <Button variant="outline" className="h-9 text-xs" onClick={cancelWaiting}>Cancel</Button>
                </div>
            );
        }

        return (
            <>
                {payment.stage === "failed" && (
                    <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-500/10 rounded p-3">
                        <XCircle className="w-4 h-4 shrink-0" />
                        <span>{payment.error}</span>
                    </div>
                )}

                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="momo-phone" className="text-xs font-semibold">Mobile Money number</Label>
                        {user?.phone_number && phone !== user.phone_number && (
                            <button type="button" onClick={() => setPhone(user.phone_number || "")} className="text-[11px] font-medium text-primary hover:underline">
                                Use my number
                            </button>
                        )}
                    </div>
                    <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                            id="momo-phone"
                            inputMode="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="0770 000 000"
                            className="h-11 pl-9 pr-20 text-sm font-mono"
                            autoFocus
                        />
                        {network && (
                            <span
                                className={cn(
                                    "absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 items-center rounded-sm px-2 text-[10px] font-black",
                                    network === "mtn" ? "bg-[#ffcb05] text-black" : "bg-[#e40000] text-white"
                                )}
                            >
                                {network === "mtn" ? "MTN" : "airtel"}
                            </span>
                        )}
                    </div>
                    <p className={cn("text-[11px]", phone && !valid ? "text-rose-600" : "text-muted-foreground")}>
                        {phone && !valid ? "Enter a valid Ugandan number, e.g. 0770 123 456" : "MTN or Airtel. You'll get a PIN prompt on this phone."}
                    </p>
                </div>

                <Button className="w-full h-11 text-sm gap-2" onClick={handlePay} disabled={!valid}>
                    <Smartphone className="w-4 h-4" />
                    {payment.stage === "failed" ? "Try again" : `Pay ${amount}`}
                </Button>
                <p className="text-[11px] text-center text-muted-foreground">About {formatUsd(order.amountUgx)} at today's rate.</p>
            </>
        );
    })();

    return (
        <CheckoutShell title="Pay with Mobile Money" subtitle="MTN Mobile Money or Airtel Money. You approve the payment on your phone." order={order} currency="ugx">
            {body}
        </CheckoutShell>
    );
}
