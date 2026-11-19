"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { RecordNotFoundPage } from "../../../components/record-not-found";

/**
 * The page every screen under /supervision/cycles/[cycleId] shows when the
 * cycle itself does not exist (an unknown id, or not an id at all): the
 * cycle's own not-found state with the way back to the cycle list, never a
 * load failure whose "Coba lagi" cannot succeed. Shown once
 * `isNotFoundError` (lib/api/not-found.ts) says so of the cycle's read.
 */
export function CycleNotFoundPage(): ReactElement {
  const t = useTranslations("app.supervision.cycleDetail");
  return (
    <RecordNotFoundPage
      title={t("notFoundTitle")}
      backHref="/supervision/cycles"
      backLabel={t("backToCycles")}
    />
  );
}
