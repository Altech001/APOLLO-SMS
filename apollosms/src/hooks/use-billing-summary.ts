import { apollosmsApi, BillingSummary } from "@/api/apollosms";
import { useCallback, useEffect, useState } from "react";

/** Notifies every billing view (header, composer, billing page) that balances changed. */
export const notifyBillingChange = () => window.dispatchEvent(new CustomEvent("renult-wallet-change"));

/** Loads the current plan, balances and free allowance, and refreshes on focus or balance changes. */
export function useBillingSummary() {
    const [summary, setSummary] = useState<BillingSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            setSummary(await apollosmsApi.billing.summary());
        } catch {
            // keep the last known summary; views degrade gracefully
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        window.addEventListener("focus", refresh);
        window.addEventListener("renult-wallet-change", refresh);
        return () => {
            window.removeEventListener("focus", refresh);
            window.removeEventListener("renult-wallet-change", refresh);
        };
    }, [refresh]);

    return { summary, isLoading, refresh };
}

/** Paid-only features the current plan unlocks. Locked until the summary loads. */
export function usePaidFeatures() {
    const { summary, isLoading } = useBillingSummary();
    return {
        aiImages: !!summary?.features?.ai_images,
        whatsappTemplates: !!summary?.features?.whatsapp_templates,
        isLoading,
    };
}
