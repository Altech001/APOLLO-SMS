import { apollosmsApi, CreateCollectionResponse } from "@/api/apollosms";
import { isPaymentComplete, isPaymentFailed, normalizePaymentStatus } from "@/lib/payment-status";
import { useCallback, useEffect, useRef, useState } from "react";

export type CollectionStage = "idle" | "starting" | "waiting" | "completed" | "failed";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 90; // ~3 minutes for the customer to approve on their phone

/** Formats a Ugandan number the way MarzPay expects (+256...). */
export const formatUgandanPhone = (phone: string) => {
    let clean = phone.replace(/[^0-9+]/g, "").trim();
    if (clean.startsWith("0")) {
        clean = "+256" + clean.slice(1);
    } else if (clean.startsWith("256") && !clean.startsWith("+")) {
        clean = "+" + clean;
    }
    return clean;
};

/**
 * Starts a MarzPay collection and polls it until the customer approves or declines it.
 * The backend credits the account (plan, SMS or WhatsApp credits) when the payment completes.
 */
export function useCollectionPayment(onCompleted?: (collection: CreateCollectionResponse) => void) {
    const [stage, setStage] = useState<CollectionStage>("idle");
    const [status, setStatus] = useState("pending");
    const [error, setError] = useState("");
    const [collection, setCollection] = useState<CreateCollectionResponse | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeRef = useRef(false);
    const onCompletedRef = useRef(onCompleted);
    onCompletedRef.current = onCompleted;

    const stop = useCallback(() => {
        activeRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
    }, []);

    useEffect(() => stop, [stop]);

    const poll = useCallback((started: CreateCollectionResponse, attempt: number) => {
        if (!activeRef.current) return;
        timerRef.current = setTimeout(async () => {
            if (!activeRef.current) return;
            try {
                const tx = await apollosmsApi.payments.getCollection(started.reference, { sync: true });
                setStatus(normalizePaymentStatus(tx.status));
                if (isPaymentComplete(tx)) {
                    stop();
                    setStage("completed");
                    window.dispatchEvent(new CustomEvent("renult-wallet-change"));
                    onCompletedRef.current?.(started);
                    return;
                }
                if (isPaymentFailed(tx)) {
                    stop();
                    setStage("failed");
                    setError("Payment failed or was declined.");
                    return;
                }
            } catch {
                // transient network errors: keep polling until the attempt limit
            }
            if (attempt + 1 >= MAX_POLLS) {
                stop();
                setStage("failed");
                setError("We didn't receive a payment confirmation in time. If you approved it, your account will update shortly.");
                return;
            }
            poll(started, attempt + 1);
        }, POLL_INTERVAL_MS);
    }, [stop]);

    /** Runs `create` (which must start a collection) and begins polling it. */
    const start = useCallback(async (create: () => Promise<CreateCollectionResponse>) => {
        stop();
        setError("");
        setStatus("pending");
        setStage("starting");
        try {
            const started = await create();
            setCollection(started);
            setStatus(normalizePaymentStatus(started.status));
            setStage("waiting");
            activeRef.current = true;
            poll(started, 0);
        } catch (err) {
            setStage("failed");
            setError(err instanceof Error ? err.message : "Unable to start the payment");
        }
    }, [poll, stop]);

    const reset = useCallback(() => {
        stop();
        setStage("idle");
        setStatus("pending");
        setError("");
        setCollection(null);
    }, [stop]);

    return { stage, status, error, collection, start, reset };
}
