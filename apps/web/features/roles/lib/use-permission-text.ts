"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

export interface PermissionText {
  label: string;
  description: string;
}

/**
 * The human label and description of a permission code, from the roles
 * catalog that names every permission (`app.roles.permissions.<code>`).
 * Every screen that shows a permission (roles, duty types, API keys) reads
 * it through here, so one permission never reads in two languages. A code
 * the catalog does not know yet falls back to the raw code and the API's
 * own description.
 */
export function usePermissionText(): (code: string, apiDescription?: string) => PermissionText {
  const t = useTranslations("app.roles");
  return useCallback(
    (code: string, apiDescription = "") => {
      const base = `permissions.${code}`;
      if (!t.has(`${base}.label`)) return { label: code, description: apiDescription };
      return {
        label: t(`${base}.label`),
        description: t.has(`${base}.description`) ? t(`${base}.description`) : apiDescription,
      };
    },
    [t],
  );
}
