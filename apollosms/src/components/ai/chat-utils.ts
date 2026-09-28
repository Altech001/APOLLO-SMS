import { AIChatAttachment, BillingSummary, ContactGroupResponse, ContactResponse, MessageChannel } from "@/api/apollosms";

/* ───────────────────────── attached files ───────────────────────── */

/** A file the user attached, read in the browser. Spreadsheet rows stay here; the AI only sees a sample. */
export interface ChatFile {
    id: string;
    name: string;
    size: number;
    kind: "spreadsheet" | "document";
    columns?: string[];
    rows?: Array<Record<string, string>>;
    /** What the assistant is shown: a document's text, or a spreadsheet's first rows as CSV. */
    text: string;
}

export const CHAT_FILE_ACCEPT = ".csv,.tsv,.xlsx,.xls,.ods,.pdf,.docx,.txt,.md,.json,.html,.xml,.log";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 5000;
const SAMPLE_ROWS = 25;
const MAX_TEXT = 30000;

const SPREADSHEET_EXT = ["csv", "tsv", "xlsx", "xls", "ods"];
const TEXT_EXT = ["txt", "md", "json", "html", "xml", "log"];

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() || "";

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function readSpreadsheet(file: File): Promise<Pick<ChatFile, "columns" | "rows" | "text">> {
    const XLSX = await import("xlsx");
    const ext = extOf(file.name);
    // CSV/TSV are read as text so non-ASCII names survive; binary formats as bytes.
    const workbook = ext === "csv" || ext === "tsv"
        ? XLSX.read(await file.text(), { type: "string", raw: true })
        : XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheetName = workbook.SheetNames.find((n) => workbook.Sheets[n]?.["!ref"]) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error("The spreadsheet is empty");

    const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false });
    const header = (table[0] || []).map((cell, i) => String(cell ?? "").trim() || `Column ${i + 1}`);
    if (!header.length) throw new Error("The spreadsheet has no header row");
    const body = table.slice(1, MAX_ROWS + 1);
    const rows = body.map((cells) => Object.fromEntries(header.map((col, i) => [col, String(cells[i] ?? "").trim()])));

    const sample = [header, ...body.slice(0, SAMPLE_ROWS).map((cells) => header.map((_, i) => String(cells[i] ?? "")))]
        .map((line) => line.map(csvCell).join(","))
        .join("\n");
    let text = `Sheet "${sheetName}"${workbook.SheetNames.length > 1 ? ` (other sheets: ${workbook.SheetNames.filter((n) => n !== sheetName).join(", ")})` : ""}.\n`;
    text += `First ${Math.min(SAMPLE_ROWS, rows.length)} of ${rows.length} rows as CSV:\n${sample}`;
    if (table.length - 1 > MAX_ROWS) text += `\n(Only the first ${MAX_ROWS} rows were loaded.)`;
    return { columns: header, rows, text };
}

async function readPdf(file: File): Promise<string> {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    let length = 0;
    for (let i = 1; i <= doc.numPages && length < MAX_TEXT; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        const text = content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join("");
        pages.push(text.trim());
        length += text.length;
    }
    const text = pages.join("\n\n").trim();
    if (!text) throw new Error("No text found in this PDF (it may be a scanned image)");
    return text;
}

async function readDocx(file: File): Promise<string> {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value.trim();
}

/** Reads an attached file in the browser. Throws a user-facing message for unsupported files. */
export async function readChatFile(file: File): Promise<ChatFile> {
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}`);
    const ext = extOf(file.name);
    const base = { id: Math.random().toString(36).slice(2), name: file.name, size: file.size };

    if (SPREADSHEET_EXT.includes(ext)) {
        return { ...base, kind: "spreadsheet", ...(await readSpreadsheet(file)) };
    }
    let text: string;
    if (ext === "pdf") text = await readPdf(file);
    else if (ext === "docx") text = await readDocx(file);
    else if (TEXT_EXT.includes(ext) || file.type.startsWith("text/")) text = await file.text();
    else throw new Error(`Can't read ${file.name}. Attach a CSV, Excel, PDF, Word or text file.`);

    if (!text.trim()) throw new Error(`${file.name} has no readable text`);
    return { ...base, kind: "document", text: text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + "\n…(truncated)" : text };
}

/** The part of a file the assistant is sent. */
export const toAttachment = (file: ChatFile): AIChatAttachment => ({
    name: file.name,
    kind: file.kind,
    columns: file.columns,
    rows: file.rows?.length,
    text: file.text,
});

/* ───────────────────────── recipients ───────────────────────── */

export const looksLikePhone = (value: string) => value.replace(/\D/g, "").length >= 9 && !/[a-z]/i.test(value);

/** Picks the column most likely to hold phone numbers, preferring the one the AI named. */
export function guessPhoneColumn(columns: string[], rows: Array<Record<string, string>>, preferred?: string): string | undefined {
    const byName = (name?: string) => name && columns.find((c) => c.toLowerCase() === name.trim().toLowerCase());
    const named = byName(preferred);
    if (named) return named;
    const header = columns.find((c) => /phone|mobile|msisdn|tel|whatsapp|number|contact/i.test(c));
    if (header) return header;
    const sample = rows.slice(0, 50);
    return columns.find((c) => sample.filter((r) => looksLikePhone(r[c] || "")).length >= Math.max(1, sample.length * 0.6));
}

/** Fills {Column} placeholders (case-insensitive) from a spreadsheet row. */
export function fillTemplate(template: string, row: Record<string, string>) {
    const lookup = new Map(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));
    const missing = new Set<string>();
    const text = template.replace(/\{\s*([^{}]+?)\s*\}/g, (match, key: string) => {
        const value = lookup.get(key.toLowerCase());
        if (value === undefined) {
            missing.add(key);
            return match;
        }
        return value;
    });
    return { text, missing: [...missing] };
}

export interface ResolvedRecipient {
    label: string;
    phone?: string;
    /** Contact name when the recipient was matched from the address book. */
    name?: string;
}

const contactName = (c: ContactResponse) => (c.name || c.full_name || "").trim();
const contactPhone = (c: ContactResponse) => c.phone || c.phone_number || "";

/** Turns a phone number or contact name into a phone number using the user's contacts. */
export function resolveRecipient(value: string, contacts: ContactResponse[]): ResolvedRecipient {
    if (looksLikePhone(value)) return { label: value, phone: value };
    const needle = value.trim().toLowerCase();
    const exact = contacts.filter((c) => contactName(c).toLowerCase() === needle);
    const matches = exact.length ? exact : contacts.filter((c) => contactName(c).toLowerCase().includes(needle));
    const contact = matches.length === 1 ? matches[0] : undefined;
    const phone = contact && contactPhone(contact);
    return phone ? { label: value, phone, name: contactName(contact) } : { label: value };
}

/** Members of the named contact groups. Unknown group names are returned separately. */
export function resolveGroups(names: string[], groups: ContactGroupResponse[], contacts: ContactResponse[]) {
    const members: ResolvedRecipient[] = [];
    const unknown: string[] = [];
    for (const name of names) {
        const group = groups.find((g) => g.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (!group) {
            unknown.push(name);
            continue;
        }
        for (const c of contacts) {
            const ids = (c.group_ids || c.groups || []).map(String);
            const phone = contactPhone(c);
            if (phone && ids.includes(String(group.id))) members.push({ label: contactName(c) || phone, phone, name: contactName(c) });
        }
    }
    return { members, unknown };
}

/* ───────────────────────── billing ───────────────────────── */

export interface CostEstimate {
    /** SMS parts or WhatsApp messages that will be charged. */
    units: number;
    freeUnits: number;
    paidUnits: number;
    /** Credits missing from the balance, and what they cost to buy. */
    shortUnits: number;
    shortUGX: number;
    costUGX: number;
    unitLabel: string;
}

/** Same rule the SMS queue bills by: 160 bytes per part. */
export const smsParts = (message: string) => Math.max(1, Math.ceil(new TextEncoder().encode(message).length / 160));

export function estimateCost(channel: MessageChannel, messages: string[], summary: BillingSummary | null): CostEstimate | null {
    if (!summary || messages.length === 0) return null;
    const isSms = channel === "sms";
    const units = isSms ? messages.reduce((sum, m) => sum + smsParts(m), 0) : messages.length;
    const free = isSms ? summary.free_sms_remaining : summary.free_whatsapp_remaining;
    const balance = isSms ? summary.sms_balance : summary.whatsapp_balance;
    const price = isSms ? summary.sms_price_ugx : summary.whatsapp_price_ugx;
    const freeUnits = Math.min(units, Math.max(0, free));
    const paidUnits = units - freeUnits;
    const shortUnits = Math.max(0, paidUnits - balance);
    return {
        units,
        freeUnits,
        paidUnits,
        shortUnits,
        shortUGX: shortUnits * price,
        costUGX: paidUnits * price,
        unitLabel: isSms ? "SMS credit" : "WhatsApp credit",
    };
}

export const formatUGX = (amount: number) => `UGX ${Math.round(amount).toLocaleString()}`;

export const topUpPath = (channel: MessageChannel) => (channel === "whatsapp" ? "/sms-tp?redeem=whatsapp" : "/sms-tp");
