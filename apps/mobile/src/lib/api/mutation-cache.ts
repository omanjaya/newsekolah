// Mirrors apps/web/lib/query/mutation-cache.ts -- see that file's doc
// comment for the full rationale. Same defaults, same meta contract
// (mutation-meta.ts), translated with this app's own tShared/getLocale
// instead of next-intl, and toasting through showToast instead of sonner.
import { apiErrorMessageKey, translate } from "@newsekolah/i18n";
import { MutationCache } from "@tanstack/react-query";
import { getLocale } from "@/i18n/t";
import { showToast } from "@/components/ui/Toast";
import { isAuthRedirecting } from "./auth-redirect-flag";
import "./mutation-meta";

export function createMutationCache(): MutationCache {
  return new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      const message = mutation.meta?.successMessage;
      if (message) {
        showToast(message, "success");
      }
    },
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.errorToast === false) return;
      if (isAuthRedirecting()) return;
      showToast(translate(getLocale(), apiErrorMessageKey(error)), "error");
    },
  });
}
