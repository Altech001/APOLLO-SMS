import { MastercardMark, PayPalMark, VisaMark } from "@/components/billing/PaymentMethodPicker";
import { Button } from "@/components/ui/button";
import { useUsdRate } from "@/hooks/use-usd-rate";
import { startCheckoutCollection, useCheckoutOrder } from "@/lib/checkout";
import { cn } from "@/lib/utils";
import { CreditCard, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import CheckoutShell from "./CheckoutShell";

type CardProvider = "card" | "paypal";

export default function CardCheckout() {
    const order = useCheckoutOrder();
    const { formatUsd } = useUsdRate();
    const [provider, setProvider] = useState<CardProvider>("card");
    const [redirecting, setRedirecting] = useState(false);

    const handlePay = async () => {
        if (provider === "paypal") {
            toast.info("PayPal is not available yet. Please pay by card.");
            return;
        }
        setRedirecting(true);
        try {
            const collection = await startCheckoutCollection(order, "card");
            if (!collection.redirect_url) throw new Error("The card payment page is not available right now");
            window.location.assign(collection.redirect_url);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to start the card payment");
            setRedirecting(false);
        }
    };

    return (
        <CheckoutShell title="Pay with card or PayPal" subtitle="You are charged in US dollars at today's rate." order={order} currency="usd">
            <div className="grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={() => setProvider("card")}
                    className={cn(
                        "rounded border p-3 flex flex-col items-start gap-2 transition-colors",
                        provider === "card" ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/30"
                    )}
                >
                    <span className="text-xs font-semibold flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" />Card</span>
                    <span className="flex gap-1"><VisaMark /><MastercardMark /></span>
                </button>
                <button
                    type="button"
                    onClick={() => setProvider("paypal")}
                    className={cn(
                        "rounded border p-3 flex flex-col items-start gap-2 transition-colors",
                        provider === "paypal" ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/30"
                    )}
                >
                    <span className="text-xs font-semibold">PayPal</span>
                    <PayPalMark />
                </button>
            </div>

            <div className="rounded border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground space-y-1.5">
                {provider === "card" ? (
                    <>
                        <p className="text-foreground font-medium">You'll finish on MarzPay's secure card page.</p>
                        <p>Enter your Visa or Mastercard details there. When the payment goes through you're brought back here and your credits are added.</p>
                    </>
                ) : (
                    <p>PayPal is coming soon. Use a card for now.</p>
                )}
            </div>

            <Button className="w-full h-11 text-sm gap-2" onClick={handlePay} disabled={redirecting || provider === "paypal"}>
                {redirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {redirecting ? "Opening card page…" : `Pay ${formatUsd(order.amountUgx)}`}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1">
                <Lock className="w-3 h-3" />
                You're charged UGX {order.amountUgx.toLocaleString()}. Card details are handled by MarzPay, not stored by ApolloSMS.
            </p>
        </CheckoutShell>
    );
}
