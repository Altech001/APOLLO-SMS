import type { VerificationRequired } from "@/api/apollosms";

// The verify screen survives a refresh by keeping the (short-lived) ticket for this tab only.
const KEY = "lucosms:pending-verification";

export function saveVerification(info: VerificationRequired) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(info));
  } catch {
    // Storage can be unavailable (private mode); router state still carries it.
  }
}

export function loadVerification(): VerificationRequired | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VerificationRequired) : null;
  } catch {
    return null;
  }
}

export function clearVerification() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function isVerificationRequired(data: unknown): data is VerificationRequired {
  return !!data && typeof data === "object" && typeof (data as VerificationRequired).ticket === "string";
}
