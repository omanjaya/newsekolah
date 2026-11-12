"use client";

import { useSession } from "../session/session-provider";

import { isModuleEnabled, type FeatureModule } from "./feature-modules";

/**
 * True while the school has `module` switched on. Use it to skip a query
 * (`enabled: useModuleEnabled("library")`) or hide a section whose API the
 * central module gate would answer with 403 MODULE_DISABLED. Components that
 * only hold a `me` value call `isModuleEnabled` directly.
 */
export function useModuleEnabled(module: FeatureModule): boolean {
  const { me } = useSession();
  return isModuleEnabled(me, module);
}
