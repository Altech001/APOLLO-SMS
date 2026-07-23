import { AlertCircle, Check, FileText, UploadCloud, X } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { parseCsvContacts, type ParsedContact } from "./csvImportUtils";

interface CsvImportProps {
    onImportComplete?: (contacts: ParsedContact[]) => void;
}

const ACCENT = "#9AFF3D";
const ACCENT_SOFT = "rgba(154,255,61,0.14)";
const ACCENT_BORDER = "rgba(154,255,61,0.35)";

const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export default function CsvImport({ onImportComplete }: CsvImportProps) {
    const [dragActive, setDragActive] = useState(false);
    const [fileInfo, setFileInfo] = useState<{ name: string; size: number; rows: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const hasFile = Boolean(fileInfo);

    const previewLabel = useMemo(() => {
        if (!fileInfo) return "No file selected";
        return `${fileInfo.rows} rows • ${formatSize(fileInfo.size)}`;
    }, [fileInfo]);

    const handleFile = (file: File | undefined) => {
        if (!file) return;

        const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
        if (!isCsv) {
            setError("Please select a valid .csv file.");
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setError("File exceeds the 10MB limit.");
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const text = reader.result as string | null;
            if (!text) {
                setError("Unable to read the selected file.");
                return;
            }

            const contacts = parseCsvContacts(text);
            const rowCount = text
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean).length;

            setFileInfo({ name: file.name, size: file.size, rows: rowCount });
            setError(null);

            if (contacts.length > 0) {
                onImportComplete?.(contacts);
                toast.success(`Imported ${contacts.length} contact${contacts.length === 1 ? "" : "s"} from ${file.name}`);
            } else {
                setError("No valid phone numbers were found in the CSV file.");
                toast.error("No valid phone numbers were found in the CSV file.");
            }
        };
        reader.onerror = () => {
            setError("Unable to read the selected file.");
        };
        reader.readAsText(file);
    };

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        handleFile(event.target.files?.[0]);
        event.target.value = "";
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setDragActive(false);
        handleFile(event.dataTransfer.files?.[0]);
    };

    const resetSelection = () => {
        setFileInfo(null);
        setError(null);
    };

    return (
        <div className="space-y-4">
            <style>{`
                @keyframes csvImportSpin {
                    to { transform: rotate(360deg); }
                }
                @keyframes csvImportPulse {
                    0%, 100% { opacity: 0.35; transform: scale(1); }
                    50% { opacity: 0.85; transform: scale(1.04); }
                }
                .csv-import-ring {
                    animation: csvImportSpin 6s linear infinite;
                    filter: drop-shadow(0 0 10px rgba(154,255,61,0.5)) drop-shadow(0 0 22px rgba(154,255,61,0.22));
                    transition: filter 0.3s ease, animation-duration 0.3s ease;
                }
                .csv-import-ring.active {
                    animation-duration: 1.6s;
                    filter: drop-shadow(0 0 16px rgba(154,255,61,0.85)) drop-shadow(0 0 38px rgba(154,255,61,0.45));
                }
                .csv-import-glow {
                    animation: csvImportPulse 2.6s ease-in-out infinite;
                }
            `}</style>

            <div
                onDragEnter={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDragActive(true);
                }}
                onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDragActive(true);
                }}
                onDragLeave={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDragActive(false);
                }}
                onDrop={handleDrop}
                className="relative mx-auto flex h-56 w-56 items-center justify-center rounded-full"
            >
                <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleInputChange}
                    className="absolute inset-0 z-10 cursor-pointer rounded-full opacity-0"
                />

                {/* soft pulsing halo */}
                <div
                    className="csv-import-glow pointer-events-none absolute -inset-3 rounded-full"
                    style={{ boxShadow: "0 0 36px 6px rgba(154,255,61,0.16)" }}
                />

                {/* spinning conic gradient ring */}
                <div
                    className={cn("csv-import-ring absolute inset-0 rounded-full", dragActive && "active")}
                    style={{
                        padding: 2,
                        background: "conic-gradient(from 0deg, rgba(154,255,61,1), transparent 65%, rgba(154,255,61,1))",
                        WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                        WebkitMaskComposite: "xor",
                        maskComposite: "exclude",
                    }}
                />

                {/* inner disc */}
                <div
                    className="relative flex h-[calc(100%-10px)] w-[calc(100%-10px)] flex-col items-center justify-center rounded-full border p-6 text-center transition-colors"
                    style={{
                        borderColor: dragActive ? ACCENT_BORDER : "hsl(var(--border) / 0.6)",
                        backgroundColor: dragActive ? ACCENT_SOFT : undefined,
                    }}
                >
                    <div
                        className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
                        style={{ backgroundColor: ACCENT_SOFT, color: ACCENT }}
                    >
                        <UploadCloud className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold leading-snug text-foreground">
                        Click or drag-and-drop
                        <br />
                        your CSV file here
                    </p>
                    <span
                        className="mt-1 text-xs font-semibold underline underline-offset-2"
                        style={{ color: ACCENT }}
                    >
                        Or select a file
                    </span>
                    <p className="mt-2 text-[11px] text-muted-foreground">CSV only • up to 10MB</p>
                </div>
            </div>

            {hasFile && (
                <div
                    className="mx-auto flex max-w-xs items-center gap-3 rounded-xl border bg-card/70 p-3"
                    style={{ borderColor: ACCENT_BORDER, backgroundColor: ACCENT_SOFT }}
                >
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: "rgba(154,255,61,0.18)" }}>
                        <FileText className="h-5 w-5" style={{ color: ACCENT }} />
                        <span
                            className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2"
                            style={{ backgroundColor: ACCENT, borderColor: "hsl(var(--card))" }}
                        >
                            <Check className="h-2.5 w-2.5 text-black" strokeWidth={3} />
                        </span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{fileInfo?.name}</p>
                        <p className="text-[11px] text-muted-foreground">{previewLabel}</p>
                    </div>
                    <button
                        type="button"
                        onClick={resetSelection}
                        className="rounded-full p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                        aria-label="Remove file"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {error && (
                <div className="mx-auto flex max-w-xs items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}