import type { ModuleFlags } from "../modules/feature-modules";

/** How often an open session re-reads `/v1/me` while any module is off. */
export const MODULE_FLAG_REFRESH_MS = 60_000;

/**
 * The `refetchInterval` for the session query. A module switched off shows
 * itself through the 403 MODULE_DISABLED path (lib/query/module-disabled.ts),
 * but one switched back on produces no error, so an open tab would keep
 * hiding it until focus changes or a reload. While the session lists any
 * disabled module it polls as a backstop; a school with every module on
 * never polls.
 */
export function moduleFlagRefetchInterval(me: ModuleFlags | undefined): number | false {
  return (me?.disabled_modules?.length ?? 0) > 0 ? MODULE_FLAG_REFRESH_MS : false;
}
