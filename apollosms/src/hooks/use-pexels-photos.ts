import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

const CACHE_KEY = "apollosms:pexels-photos";
const CACHE_TTL = 24 * 60 * 60_000;
const API_KEY = import.meta.env.VITE_PEXELS_API_KEY as string | undefined;
const QUERIES = ["people texting", "smartphone lifestyle", "business team", "city lights", "african entrepreneur", "minimal workspace"];

export type PexelsPhoto = {
    id: number;
    width: number;
    height: number;
    alt: string;
    avgColor: string;
    src: string;
};

type PhotoCache = { photos: PexelsPhoto[]; at: number };

const readCache = (): PhotoCache | undefined => {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        const cache = raw ? (JSON.parse(raw) as PhotoCache) : undefined;
        return cache?.photos?.length ? cache : undefined;
    } catch {
        return undefined;
    }
};

const writeCache = (photos: PexelsPhoto[]) => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ photos, at: Date.now() }));
    } catch {
        /* storage blocked */
    }
};

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

const shuffle = <T,>(items: T[]) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

async function fetchPexelsPhotos(): Promise<PexelsPhoto[]> {
    const params = new URLSearchParams({
        query: pick(QUERIES),
        per_page: "40",
        page: String(1 + Math.floor(Math.random() * 3)),
    });
    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
        headers: { Authorization: API_KEY! },
    });
    if (!res.ok) throw new Error("Unable to load Pexels photos");
    const data = await res.json();
    return (data?.photos ?? []).map((p: any) => ({
        id: p.id,
        width: p.width,
        height: p.height,
        alt: p.alt ?? "",
        avgColor: p.avg_color ?? "#2a2a2a",
        src: p.src?.large ?? p.src?.medium,
    }));
}

export function usePexelsPhotos(count = 18) {
    const query = useQuery({
        queryKey: ["pexels", "auth-backdrop"],
        queryFn: async () => {
            const photos = await fetchPexelsPhotos();
            if (photos.length) writeCache(photos);
            return photos;
        },
        enabled: Boolean(API_KEY),
        initialData: () => readCache()?.photos,
        initialDataUpdatedAt: () => readCache()?.at,
        staleTime: CACHE_TTL,
        gcTime: CACHE_TTL,
        refetchOnWindowFocus: false,
        retry: 1,
    });

    return useMemo(() => shuffle(query.data ?? []).slice(0, count), [query.data, count]);
}
