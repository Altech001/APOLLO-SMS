import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

const CACHE_KEY = "apollosms:usd-ugx-rate";
const FALLBACK_UGX_PER_USD = 3700;

type RateCache = { rate: number; at: number };

const readCache = (): RateCache | undefined => {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? (JSON.parse(raw) as RateCache) : undefined;
    } catch {
        return undefined;
    }
};

const writeCache = (rate: number) => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, at: Date.now() }));
    } catch {
        /* storage blocked */
    }
};

const validRate = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);

async function fetchUgxPerUsd(): Promise<number> {
    try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        if (res.ok) {
            const rate = validRate((await res.json())?.rates?.UGX);
            if (rate) return rate;
        }
    } catch {
        /* try the next source */
    }
    const res = await fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json");
    if (!res.ok) throw new Error("Unable to load the dollar rate");
    const rate = validRate((await res.json())?.usd?.ugx);
    if (!rate) throw new Error("Unable to load the dollar rate");
    return rate;
}

export function useUsdRate() {
    const query = useQuery({
        queryKey: ["fx", "usd-ugx"],
        queryFn: async () => {
            const rate = await fetchUgxPerUsd();
            writeCache(rate);
            return rate;
        },
        initialData: () => readCache()?.rate,
        initialDataUpdatedAt: () => readCache()?.at,
        staleTime: 6 * 60 * 60_000,
        gcTime: 24 * 60 * 60_000,
        retry: 1,
    });

    const rate = query.data || FALLBACK_UGX_PER_USD;
    const toUsd = useCallback((ugx: number) => ugx / rate, [rate]);
    const formatUsd = useCallback(
        (ugx: number) => {
            const usd = ugx / rate;
            const digits = usd >= 1000 ? 0 : usd < 1 ? 4 : 2;
            return `$${usd.toLocaleString(undefined, { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits })}`;
        },
        [rate]
    );

    return { rate, isLive: Boolean(query.data), toUsd, formatUsd };
}
