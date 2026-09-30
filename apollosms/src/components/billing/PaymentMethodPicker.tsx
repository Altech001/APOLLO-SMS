import { cn } from "@/lib/utils";
import { Check, CreditCard, Smartphone } from "lucide-react";

import type { PaymentMethod } from "@/lib/checkout";

export function VisaMark({ className }: { className?: string }) {
    return (
        <span className={cn("inline-flex h-5 items-center rounded-sm border border-border/60 bg-white px-1.5 text-[10px] font-black italic tracking-tight text-[#1a1f71]", className)}>
            VISA
        </span>
    );
}

export function MastercardMark({ className }: { className?: string }) {
    return (
        <span className={cn("inline-flex h-5 items-center rounded-sm border border-border/60 bg-white px-1", className)} aria-label="Mastercard">
            <span className="w-3 h-3 rounded-full bg-[#eb001b]" />
            <span className="w-3 h-3 rounded-full bg-[#f79e1b] -ml-1.5 mix-blend-multiply" />
        </span>
    );
}

export function PayPalMark({ className }: { className?: string }) {
    return (
        <span className={cn("inline-flex h-5 items-center rounded-sm border border-border/60 bg-white px-1.5 text-[10px] font-extrabold italic", className)}>
            <span className="text-[#003087]">Pay</span>
            <span className="text-[#009cde]">Pal</span>
        </span>
    );
}

export function MobileMoneyMarks() {
    return (
        <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-5 items-center rounded-sm bg-[#ffcb05] px-1.5 text-[9px] font-black text-black">MTN</span>
            <span className="inline-flex h-5 items-center rounded-sm bg-[#e40000] px-1.5 text-[9px] font-black text-white">airtel</span>
        </span>
    );
}

export default function PaymentMethodPicker({
    value,
    onChange,
    disabled,
}: {
    value: PaymentMethod;
    onChange: (method: PaymentMethod) => void;
    disabled?: boolean;
}) {
    const options = [
        {
            id: "mobile_money" as const,
            title: "Mobile Money",
            hint: "Approve with your PIN",
            icon: <Smartphone className="w-4 h-4" />,
            marks: <MobileMoneyMarks />,
        },
        {
            id: "card" as const,
            title: "Card or PayPal",
            hint: "Pay in USD",
            icon: <CreditCard className="w-4 h-4" />,
            marks: (
                <span className="inline-flex items-center gap-1">
                    <VisaMark />
                    <MastercardMark />
                    <PayPalMark />
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">Pay with</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {options.map((option) => {
                    const active = value === option.id;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange(option.id)}
                            aria-pressed={active}
                            className={cn(
                                "relative rounded border p-3 text-left transition-colors disabled:opacity-60",
                                active ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/30"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <span className={cn("w-7 h-7 rounded-full flex items-center justify-center", active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70")}>
                                    {option.icon}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-foreground">{option.title}</p>
                                    <p className="text-[10px] text-muted-foreground">{option.hint}</p>
                                </div>
                                {active && <Check className="w-4 h-4 text-primary ml-auto" />}
                            </div>
                            <div className="mt-2.5">{option.marks}</div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
