import type { PaymentTransactionResponse } from "@/api/apollosms";

/** MarzPay may return completed, successful, success, or complete for a paid collection. */
const PAYMENT_SUCCESS_STATUSES = new Set(["completed", "successful", "success", "complete"]);
const PAYMENT_FAILED_STATUSES = new Set(["failed", "cancelled", "declined", "canceled"]);

export const normalizePaymentStatus = (status?: string | null) =>
  status?.trim().toLowerCase() || "pending";

export const isPaymentComplete = (tx: Pick<PaymentTransactionResponse, "status" | "completed_at">) => {
  const status = normalizePaymentStatus(tx.status);
  return PAYMENT_SUCCESS_STATUSES.has(status) || Boolean(tx.completed_at);
};

export const isPaymentFailed = (tx: Pick<PaymentTransactionResponse, "status">) =>
  PAYMENT_FAILED_STATUSES.has(normalizePaymentStatus(tx.status));

export const isPaymentPending = (tx: Pick<PaymentTransactionResponse, "status" | "completed_at">) =>
  !isPaymentComplete(tx) && !isPaymentFailed(tx);
