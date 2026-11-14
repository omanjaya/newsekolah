"use client";

import { Badge } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * Whether a title can be borrowed now, the one thing a catalogue visitor
 * scans for: "1 dari 2 tersedia" in success green (just "Tersedia" where
 * room is short, on a shelf card), or a quiet "Dipinjam" when every copy
 * is out.
 */
export function OpacAvailability({
  available,
  total,
  compact = false,
}: {
  available: number;
  total: number;
  compact?: boolean;
}): ReactElement {
  const t = useTranslations("app.library.opac");
  if (total === 0) return <Badge tone="neutral">{t("detail.noCopiesShort")}</Badge>;
  if (available > 0) {
    return (
      <Badge tone="success" dot>
        {compact ? t("available") : t("availableCount", { available, total })}
      </Badge>
    );
  }
  return <Badge tone="neutral">{t("unavailable")}</Badge>;
}
