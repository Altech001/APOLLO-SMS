import { useMemo, useState } from "react";
import { usePexelsPhotos, type PexelsPhoto } from "@/hooks/use-pexels-photos";

const COLUMNS = 3;

function distribute(photos: PexelsPhoto[]) {
    const columns: PexelsPhoto[][] = Array.from({ length: COLUMNS }, () => []);
    const heights = new Array(COLUMNS).fill(0);
    photos.forEach((photo) => {
        const shortest = heights.indexOf(Math.min(...heights));
        columns[shortest].push(photo);
        heights[shortest] += photo.height / photo.width;
    });
    return columns;
}

function Tile({ photo, index }: { photo: PexelsPhoto; index: number }) {
    const [loaded, setLoaded] = useState(false);
    return (
        <div
            className="relative w-full overflow-hidden rounded-xl"
            style={{ aspectRatio: `${photo.width} / ${photo.height}`, backgroundColor: photo.avgColor }}
        >
            <img
                src={photo.src}
                alt={photo.alt}
                loading={index < 6 ? "eager" : "lazy"}
                decoding="async"
                onLoad={() => setLoaded(true)}
                className={`h-full w-full object-cover transition-all duration-700 ease-out ${loaded ? "opacity-100 scale-100" : "opacity-0 scale-105"}`}
            />
        </div>
    );
}

export default function PexelsMasonry({ fallback }: { fallback: React.ReactNode }) {
    const photos = usePexelsPhotos();
    const columns = useMemo(() => distribute(photos), [photos]);

    if (!photos.length) return <>{fallback}</>;

    return (
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden" aria-hidden>
            <div className="flex gap-3 p-3 -rotate-6 scale-125 origin-center">
                {columns.map((column, c) => (
                    <div key={c} className={`flex flex-1 flex-col gap-3 ${c % 2 === 1 ? "-mt-24" : ""}`}>
                        {column.map((photo, i) => (
                            <Tile key={photo.id} photo={photo} index={i * COLUMNS + c} />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
