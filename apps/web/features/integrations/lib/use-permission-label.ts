"use client";

import { usePermissionText } from "../../roles/lib/use-permission-text";

/**
 * The human label of a permission code, from the roles catalog that already
 * names every permission (`app.roles.permissions.<code>.label`). A code the
 * catalog does not know yet falls back to the raw code.
 */
export function usePermissionLabel(): (code: string) => string {
  const text = usePermissionText();
  return (code) => text(code).label;
}
