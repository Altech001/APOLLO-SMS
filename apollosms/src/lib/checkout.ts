import { apollosmsApi, CreateCollectionResponse } from "@/api/apollosms";
import { useSearchParams } from "react-router-dom";

export type PaymentMethod = "mobile_money" | "card";

export type CheckoutOrder =
    | { purpose: "plan"; amountUgx: number; planId: string | number; label: string }
    | { purpose: "sms"; amountUgx: number; sms: number; label: string }
    | { purpose: "whatsapp"; amountUgx: number; credits: number; label: string };

const CHECKOUT_ROUTES: Record<PaymentMethod, string> = {
    mobile_money: "/checkout/mobile-money",
    card: "/checkout/card",
};

export const checkoutPath = (method: PaymentMethod, order: CheckoutOrder) => {
    const params = new URLSearchParams({ purpose: order.purpose, amount: String(order.amountUgx), label: order.label });
    if (order.purpose === "plan") params.set("plan_id", String(order.planId));
    if (order.purpose === "sms") params.set("sms", String(order.sms));
    if (order.purpose === "whatsapp") params.set("credits", String(order.credits));
    return `${CHECKOUT_ROUTES[method]}?${params.toString()}`;
};

const PURPOSE_LABEL: Record<string, string> = {
    plan: "Plan subscription",
    sms: "SMS credits",
    whatsapp: "WhatsApp credits",
};

export interface ParsedCheckoutOrder {
    purpose: string;
    amountUgx: number;
    label: string;
    planId: string | null;
    sms: number;
    credits: number;
}

export function useCheckoutOrder(): ParsedCheckoutOrder {
    const [params] = useSearchParams();
    const purpose = params.get("purpose") || "";
    return {
        purpose,
        amountUgx: Math.max(0, Number(params.get("amount")) || 0),
        label: params.get("label") || PURPOSE_LABEL[purpose] || "Payment",
        planId: params.get("plan_id"),
        sms: Number(params.get("sms")) || 0,
        credits: Number(params.get("credits")) || 0,
    };
}

export async function startCheckoutCollection(
    order: ParsedCheckoutOrder,
    method: PaymentMethod,
    phoneNumber?: string
): Promise<CreateCollectionResponse> {
    const phone = method === "mobile_money" ? phoneNumber : undefined;
    if (order.purpose === "plan" && order.planId) {
        const res = await apollosmsApi.billing.subscribe({ plan_id: order.planId, method, phone_number: phone });
        if (!res.collection) throw new Error("The payment could not be started");
        return res.collection;
    }
    if (order.purpose === "whatsapp") {
        return apollosmsApi.billing.buyWhatsAppCredits({ credits: order.credits, method, phone_number: phone });
    }
    return apollosmsApi.payments.createCollection({ amount_ugx: order.amountUgx, method, phone_number: phone, description: order.label });
}
