"use client";

import { useCallback } from "react";

import { usePermissionText } from "../../roles/lib/use-permission-text";

/**
 * The human label of a permission code, from the roles catalog that already
 * names every permission (`app.roles.permissions.<code>.label`). A code the
 * catalog does not know yet falls back to the raw code. Stable per locale,
 * so table columns built from it are not rebuilt on every render.
 */
export function usePermissionLabel(): (code: string) => string {
  const text = usePermissionText();
  return useCallback((code: string) => text(code).label, [text]);
}
