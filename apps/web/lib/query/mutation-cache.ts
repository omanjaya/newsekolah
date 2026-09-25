import { apiErrorMessageKey, translate } from "@newsekolah/i18n";
import { toast } from "@newsekolah/ui";
import { MutationCache } from "@tanstack/react-query";

import { getCurrentLocale } from "../i18n/current-locale";
import { isAuthRedirecting } from "../session/auth-redirect-flag";

import "./mutation-meta.js";

/**
 * The feedback safety net docs/analysis/feedback-audit-2026-09-25.md exists
 * to close: every `useMutation()` in the app shares this `MutationCache`
 * (via `createQueryClient` in `query-provider.tsx`), so a mutation shows
 * *something* on failure even if whoever wrote its call site forgot to.
 *
 * - Error is opt-out (`meta.errorToast: false`), not opt-in: most call
 *   sites today show nothing on failure, which is the actual bug report
 *   ("aksi berhasil atau gagal sering tidak ada umpan balik sama sekali").
 *   A mutation only sets `errorToast: false` once its call site already
 *   shows the failure well enough on its own (an inline `role="alert"`
 *   next to the field) that a second, generic toast on top would be noise
 *   rather than help.
 * - Success is opt-in (`meta.successMessage`) so silent/background
 *   mutations (an autosave, a realtime-driven refresh) stay silent by
 *   default -- the opposite default from error, deliberately: staying
 *   quiet on an unasked-for success is fine, staying quiet on a failure
 *   the user is waiting on is the bug.
 * - `isAuthRedirecting()` swallows the toast while `handleUnauthorized`
 *   (app/providers.tsx) is navigating to `/login`: every mutation in
 *   flight when a session dies rejects with the same 401 in the same
 *   tick, and the user has no time to read a burst of duplicate "session
 *   expired" toasts before the page changes under them anyway.
 */
export function createMutationCache(): MutationCache {
  return new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      const message = mutation.meta?.successMessage;
      if (message) {
        toast.success(message);
      }
    },
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.errorToast === false) return;
      if (isAuthRedirecting()) return;
      toast.error(translate(getCurrentLocale(), apiErrorMessageKey(error)));
    },
  });
}
