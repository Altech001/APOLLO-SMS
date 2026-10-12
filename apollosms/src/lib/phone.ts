const allowedUgandanPhoneChars = /^[+0-9\s().-]+$/;

/**
 * Normalizes common Ugandan phone input to E.164. Returns null for incomplete,
 * malformed, or non-Ugandan numbers so callers can stop before sending.
 */
export function normalizeUgandanPhone(raw: string): string | null {
    const value = raw.trim();
    if (!value || !allowedUgandanPhoneChars.test(value)) return null;

    let digits = value.replace(/\D/g, "");
    if (!digits) return null;
    if (value.startsWith("+")) {
        if (!digits.startsWith("256")) return null;
    } else if (digits.startsWith("00")) {
        if (!digits.slice(2).startsWith("256")) return null;
        digits = digits.slice(2);
    }

    let subscriber = digits;
    if (subscriber.startsWith("256")) subscriber = subscriber.slice(3);
    else if (subscriber.startsWith("0")) subscriber = subscriber.slice(1);

    if (!/^[2-7]\d{8}$/.test(subscriber)) return null;
    return `+256${subscriber}`;
}

export function requireUgandanPhone(raw: string): string {
    const normalized = normalizeUgandanPhone(raw);
    if (!normalized) throw new Error("Enter a complete Ugandan number, e.g. 0772 123 456");
    return normalized;
}
