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
