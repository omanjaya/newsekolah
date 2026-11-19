import idShared from "@newsekolah/i18n/messages/id.json";
import { useTranslations } from "next-intl";

/**
 * Every `ApiError.code` the shared `errors.*` catalog translates. Derived
 * from the catalog itself (id.json is authoritative; en.json is kept in
 * lockstep by packages/i18n's codegen) so a new API code needs one catalog
 * entry, not a second hand-maintained list here.
 */
const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set(Object.keys(idShared.errors));

/**
 * Maps `ApiError.code` to the shared `errors.*` catalog instead of showing
 * the server's own `message` directly, so a client-side locale switch stays
 * consistent (see packages/api-client's ApiError doc comment). Codes the
 * catalog does not recognize fall back to `fallback` when one is given (a
 * batch row's server `reason`, better than nothing) and otherwise to
 * `errors.UNKNOWN`, rather than throwing or leaking a raw code to the user.
 */
export function useApiErrorMessage() {
  const t = useTranslations("errors");
  return (code: string, fallback?: string): string => {
    if (KNOWN_ERROR_CODES.has(code)) return t(code);
    return fallback ?? t("UNKNOWN");
  };
}
