"use client";

import { useTranslations } from "next-intl";

/**
 * The human label of a permission code, from the roles catalog that already
 * names every permission (`app.roles.permissions.<code>.label`). A code the
 * catalog does not know yet falls back to the raw code.
 */
export function usePermissionLabel(): (code: string) => string {
  const t = useTranslations("app.roles");
  return (code) => {
    const key = `permissions.${code}.label`;
    return t.has(key) ? t(key) : code;
  };
}
