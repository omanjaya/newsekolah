import { ApiError, queryKeys } from "@newsekolah/api-client";
import type { QueryClient } from "@tanstack/react-query";

/** True for the 403 the central module gate answers when a module is switched off. */
export function isModuleDisabledError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && error.code === "MODULE_DISABLED";
}

/**
 * A request hit a module that is off although the session said otherwise
 * (the vendor flipped the flag mid-session). Re-read `/v1/me` so
 * `disabled_modules` catches up: the menu drops the entry and the shell
 * shows the "module not available" state instead of a broken screen. It is
 * not an authentication failure, so nothing here signs the reader out.
 */
export function refreshSessionOnModuleDisabled(client: QueryClient, error: unknown): void {
  if (!isModuleDisabledError(error)) return;
  const key = queryKeys.me();
  // Many queries of one screen fail together; one refetch is enough.
  if (client.isFetching({ queryKey: key }) > 0) return;
  void client.invalidateQueries({ queryKey: key });
}
