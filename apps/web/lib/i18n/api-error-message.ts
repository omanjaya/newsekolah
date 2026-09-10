import { useTranslations } from "next-intl";

/** Every `ApiError.code` the API contract documents (openapi.yaml `Error.code`). */
const KNOWN_ERROR_CODES = new Set([
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_TOKEN_EXPIRED",
  "TENANT_NOT_FOUND",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
  "FORBIDDEN",
  "NOT_FOUND",
  "NETWORK",
  "UNKNOWN",
  "SSO_NOT_CONFIGURED",
  "SSO_ACCOUNT_NOT_FOUND",
  "SSO_INVALID_TOKEN",
  "SSO_CLIENT_SECRET_REQUIRED",
  "PASSKEY_NOT_CONFIGURED",
  "PASSKEY_NOT_FOUND",
  "PASSKEY_CHALLENGE_EXPIRED",
  "PASSKEY_INVALID_RESPONSE",
  "USER_ALREADY_EXISTS",
  "DUTY_TYPE_IN_USE",
  "IMPERSONATION_NOT_ALLOWED",
  "NOT_IMPERSONATING",
  "PASSWORD_RESET_TOKEN_INVALID",
  "UPLOAD_INVALID_FILE_TYPE",
  "UPLOAD_FILE_TOO_LARGE",
  "UPLOAD_NOT_CONFIGURED",
  "LIBRARY_TITLE_NOT_FOUND",
  "LIBRARY_COPY_NOT_FOUND",
  "LIBRARY_COPY_BARCODE_EXISTS",
  "LIBRARY_COPY_NOT_AVAILABLE",
  "LIBRARY_COPY_ON_LOAN",
  "LIBRARY_LOAN_NOT_FOUND",
  "LIBRARY_LOAN_ALREADY_RETURNED",
  "LIBRARY_LOAN_LIMIT_REACHED",
  "LIBRARY_RENEWAL_LIMIT_REACHED",
  "LIBRARY_RENEWAL_BLOCKED_OVERDUE",
  "LIBRARY_RENEWAL_BLOCKED_RESERVED",
  "LIBRARY_RESERVATION_NOT_FOUND",
  "LIBRARY_RESERVATION_NOT_WAITING",
  "LIBRARY_COPY_AVAILABLE_FOR_LOAN",
  "LIBRARY_STOCKTAKE_NOT_FOUND",
  "LIBRARY_STOCKTAKE_CLOSED",
  "BILLING_MODULE_DISABLED",
  "FEE_TYPE_NOT_FOUND",
  "DISCOUNT_NOT_FOUND",
  "BILL_NOT_FOUND",
  "BILL_ALREADY_PAID",
  "PAYMENT_NOT_FOUND",
  "PAYMENT_ALREADY_VOIDED",
  "PAYMENT_EXCEEDS_OUTSTANDING",
]);

/**
 * Maps `ApiError.code` to the shared `errors.*` catalog instead of showing
 * the server's own `message` directly, so a client-side locale switch stays
 * consistent (see packages/api-client's ApiError doc comment). Codes the
 * catalog does not recognize fall back to `errors.UNKNOWN` rather than
 * throwing or leaking a raw code to the user.
 */
export function useApiErrorMessage() {
  const t = useTranslations("errors");
  return (code: string) => t(KNOWN_ERROR_CODES.has(code) ? code : "UNKNOWN");
}
