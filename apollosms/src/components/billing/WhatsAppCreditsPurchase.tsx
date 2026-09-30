import PaymentMethodPicker from "@/components/billing/PaymentMethodPicker";
import { checkoutPath, PaymentMethod } from "@/lib/checkout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBillingSummary } from "@/hooks/use-billing-summary";
import { useUsdRate } from "@/hooks/use-usd-rate";
import { ArrowRight, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const QUICK_PICKS = [100, 300, 1000, 5000];

/** "Buy WhatsApp credits" form priced by the user's current plan; payment happens on the checkout pages. */
export default function WhatsAppCreditsPurchase() {
    const { summary } = useBillingSummary();
    const [qtyText, setQtyText] = useState("");
    const [method, setMethod] = useState<PaymentMethod>("mobile_money");
    const navigate = useNavigate();
    const { formatUsd } = useUsdRate();
    const price = summary?.whatsapp_price_ugx || 0;
    const minOrder = summary?.min_whatsapp_credit_order || 0;
    const qty = parseInt(qtyText.replace(/[^0-9]/g, ""), 10) || 0;
    const total = qty * price;
    const tooSmall = qty > 0 && qty < minOrder;

    useEffect(() => {
        if (summary && !qtyText) setQtyText(String(Math.max(minOrder, 300)));
    }, [summary, qtyText, minOrder]);

    const handlePay = () => {
        if (!price) {
            toast.error("WhatsApp credits are not for sale on your plan");
            return;
        }
        if (qty < minOrder) {
            toast.error(`Minimum order is ${minOrder.toLocaleString()} WhatsApp credits`);
            return;
        }
        navigate(checkoutPath(method, { purpose: "whatsapp", amountUgx: total, credits: qty, label: "WhatsApp credits" }));
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-base font-bold text-foreground flex items-center gap-1.5">
                        <MessageCircle className="w-4 h-4 text-emerald-600" />
                        Buy WhatsApp Credits
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                        {summary ? `${summary.plan.name} plan price: UGX ${price.toLocaleString()} per message` : "Loading your plan…"}
                    </p>
                </div>
                <div className="text-right">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-bold">Balance</span>
                    <span className="text-xs font-black text-foreground bg-secondary/50 px-2 py-1 rounded">
                        {(summary?.whatsapp_balance ?? 0).toLocaleString()}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
                {QUICK_PICKS.filter((n) => n >= minOrder).map((n) => (
                    <button
                        key={n}
                        type="button"
                        onClick={() => setQtyText(String(n))}
                        className={
                            "h-9 rounded border text-xs font-semibold transition-colors " +
                            (qty === n ? "border-emerald-500 bg-emerald-500/10 text-emerald-700" : "border-border/60 hover:bg-muted/30")
                        }
                    >
                        {n.toLocaleString()}
                    </button>
                ))}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="wa-redeem-qty" className="text-xs font-bold text-muted-foreground">
                    WhatsApp messages (min {minOrder.toLocaleString()})
                </Label>
                <Input
                    id="wa-redeem-qty"
                    inputMode="numeric"
                    value={qtyText}
                    onChange={(e) => setQtyText(e.target.value.replace(/[^0-9]/g, ""))}
                    className="h-11 text-sm font-bold bg-muted/20 border-border/40"
                />
                {tooSmall && <p className="text-[10px] text-rose-500 font-semibold">Minimum order is {minOrder.toLocaleString()} messages.</p>}
            </div>

            <PaymentMethodPicker value={method} onChange={setMethod} />

            <div className="bg-muted/30 border border-border/10 rounded p-4 flex justify-between items-center text-xs">
                <span className="font-bold text-foreground">Total</span>
                <span className="text-right">
                    <span className="font-black text-emerald-600 text-base block">
                        {method === "card" ? formatUsd(total) : `UGX ${total.toLocaleString()}`}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                        {method === "card" ? `UGX ${total.toLocaleString()}` : `≈ ${formatUsd(total)}`}
                    </span>
                </span>
            </div>

            <Button
                type="button"
                onClick={handlePay}
                disabled={!price || qty < minOrder || total > 10000000}
                className="w-full h-11 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
                Continue
                <ArrowRight className="w-3.5 h-3.5" />
            </Button>
        </div>
    );
}
