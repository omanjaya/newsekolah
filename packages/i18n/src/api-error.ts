import { ApiError } from "@newsekolah/api-client";

import id from "../messages/id.json" with { type: "json" };

import type { MessageKey } from "./message-keys.gen.js";

/** Every `errors.*` key the shared catalog documents (id.json is authoritative;
 * en.json is kept in lockstep by the codegen script/test). */
const KNOWN_ERROR_CODES = new Set(Object.keys(id.errors));

/**
 * `fetch` rejects the request promise itself (instead of resolving with a
 * non-2xx response) when the browser/device never reached the server at
 * all: offline, DNS failure, TLS error, or the request timing out via an
 * `AbortController`. None of those go through `NewsekolahApiClient`'s own
 * error envelope, so they never become an `ApiError` -- they surface as a
 * `TypeError` (`"Failed to fetch"` / `"Network request failed"`) or an
 * `AbortError` `DOMException`.
 */
function isNetworkFailure(error: unknown): boolean {
  // This package targets Node (tsconfig.node.json, no DOM lib), but runs in
  // the browser/React Native at runtime, where `navigator.onLine` does
  // exist -- hence the loose read instead of a typed `Navigator` access.
  const nav: unknown = typeof navigator === "undefined" ? undefined : navigator;
  if (nav && typeof nav === "object" && (nav as { onLine?: unknown }).onLine === false) {
    return true;
  }
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }
  return error instanceof TypeError;
}

/**
 * Classifies anything a `NewsekolahApiClient` call can throw (an `ApiError`
 * with a server-issued `code`, or a raw network failure) into one of the
 * `errors.*` catalog keys `translate()`/`createTranslator()` resolve. Both
 * web (`useApiErrorMessage`) and mobile (the global mutation error toast)
 * should show the same specific, translated reason for the same failure
 * instead of each inventing its own fallback text.
 */
export function apiErrorMessageKey(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    return (
      KNOWN_ERROR_CODES.has(error.code) ? `errors.${error.code}` : "errors.UNKNOWN"
    ) as MessageKey;
  }
  if (isNetworkFailure(error)) {
    return "errors.NETWORK";
  }
  return "errors.UNKNOWN";
}
