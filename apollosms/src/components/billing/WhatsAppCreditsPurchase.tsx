import { apollosmsApi } from "@/api/apollosms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBillingSummary } from "@/hooks/use-billing-summary";
import { formatUgandanPhone, useCollectionPayment } from "@/hooks/use-collection-payment";
import { useAuth } from "@/lib/auth";
import { CheckCircle2, Loader2, MessageCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const QUICK_PICKS = [100, 300, 1000, 5000];

/** Self-contained "buy WhatsApp credits" form priced by the user's current plan, with inline payment status. */
export default function WhatsAppCreditsPurchase() {
    const { user } = useAuth();
    const { summary, refresh } = useBillingSummary();
    const [qtyText, setQtyText] = useState("");
    const [phone, setPhone] = useState(user?.phone_number || "");
    const payment = useCollectionPayment((collection) => {
        toast.success(`${(collection.whatsapp_credits || 0).toLocaleString()} WhatsApp credits added`);
        refresh();
    });

    useEffect(() => {
        if (!phone && user?.phone_number) setPhone(user.phone_number);
    }, [phone, user?.phone_number]);

    const price = summary?.whatsapp_price_ugx || 0;
    const minOrder = summary?.min_whatsapp_credit_order || 0;
    const qty = parseInt(qtyText.replace(/[^0-9]/g, ""), 10) || 0;
    const total = qty * price;
    const tooSmall = qty > 0 && qty < minOrder;
    const busy = payment.stage === "starting" || payment.stage === "waiting";

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
        if (!phone.trim()) {
            toast.error("Enter the mobile money number to charge");
            return;
        }
        payment.start(() => apollosmsApi.billing.buyWhatsAppCredits({ credits: qty, phone_number: formatUgandanPhone(phone.trim()) }));
    };

    if (payment.stage === "completed") {
        return (
            <div className="py-8 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
                <h2 className="text-lg font-black text-foreground">WhatsApp credits added</h2>
                <p className="text-xs text-muted-foreground">
                    {qty.toLocaleString()} credits for UGX {total.toLocaleString()}. New balance: {(summary?.whatsapp_balance ?? 0).toLocaleString()}.
                </p>
                <Button className="h-10 text-xs" onClick={payment.reset}>Buy more</Button>
            </div>
        );
    }

    if (busy) {
        return (
            <div className="py-10 text-center space-y-3">
                <Loader2 className="w-10 h-10 animate-spin mx-auto text-emerald-600" />
                <h3 className="text-sm font-bold text-foreground">
                    {payment.stage === "starting" ? "Starting payment…" : "Waiting for mobile money PIN…"}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                    Approve UGX {total.toLocaleString()} on {phone}. Status: {payment.status}
                </p>
                <Button variant="outline" className="h-9 text-xs" onClick={payment.reset}>Cancel</Button>
            </div>
        );
    }

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

            {payment.stage === "failed" && (
                <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-500/10 rounded p-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>{payment.error}</span>
                </div>
            )}

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

            <div className="space-y-1.5">
                <Label htmlFor="wa-redeem-phone" className="text-xs font-bold text-muted-foreground">Mobile money number</Label>
                <Input
                    id="wa-redeem-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0700000000"
                    className="h-11 text-sm font-mono bg-muted/20 border-border/40"
                />
            </div>

            <div className="bg-muted/30 border border-border/10 rounded p-4 flex justify-between items-center text-xs">
                <span className="font-bold text-foreground">Total</span>
                <span className="font-black text-emerald-600 text-base">UGX {total.toLocaleString()}</span>
            </div>

            <Button
                type="button"
                onClick={handlePay}
                disabled={!price || qty < minOrder || total > 10000000}
                className="w-full h-11 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
                Pay UGX {total.toLocaleString()}
            </Button>
        </div>
    );
}
