"use client";

import { Button, cn } from "@newsekolah/ui";
import { Star } from "lucide-react";
import type { useTranslations } from "next-intl";
import type { ReactElement } from "react";

export interface GradebookStarBalanceProps {
  t: ReturnType<typeof useTranslations>;
  studentName: string;
  /** The balance as shown ("-" while it is unknown). */
  label: string;
  /** Whether the viewer may give or take stars on this sheet. */
  canManage: boolean;
  onOpen: () => void;
  className?: string;
}

/**
 * A student's star balance in the gradebook. A teacher of the sheet gets a
 * button that opens the star dialog; a reader gets the same star and number
 * as plain text, named as a balance rather than an action they cannot take.
 */
export function GradebookStarBalance({
  t,
  studentName,
  label,
  canManage,
  onOpen,
  className,
}: GradebookStarBalanceProps): ReactElement {
  if (!canManage) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-body-sm text-fg-muted tabular-nums",
          className,
        )}
      >
        <Star aria-hidden="true" className="size-4" />
        <span aria-hidden="true">{label}</span>
        <span className="sr-only">{t("starsBalance", { name: studentName, balance: label })}</span>
      </span>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onOpen}
      className={cn("text-fg-muted tabular-nums hover:text-fg", className)}
      aria-label={t("starsFor", { name: studentName })}
    >
      <Star aria-hidden="true" />
      {label}
    </Button>
  );
}
