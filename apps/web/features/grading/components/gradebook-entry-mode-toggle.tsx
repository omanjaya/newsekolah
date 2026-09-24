"use client";

import { cn } from "@newsekolah/ui";
import type { useTranslations } from "next-intl";
import type { ReactElement } from "react";

export type GradebookEntryMode = "component" | "student";

/**
 * Phone-only switch between the two score-entry modes: one assessment
 * component at a time across every student (fast for finishing a whole
 * quiz), or one student at a time across every component (fast for
 * finishing one student's report). Desktop always shows the full grid, so
 * this has no desktop equivalent.
 */
export function GradebookEntryModeToggle({
  t,
  mode,
  onModeChange,
}: {
  t: ReturnType<typeof useTranslations>;
  mode: GradebookEntryMode;
  onModeChange: (mode: GradebookEntryMode) => void;
}): ReactElement {
  return (
    <div
      role="tablist"
      aria-label={t("entryMode.label")}
      className="inline-flex w-fit gap-1 rounded-sm border border-border bg-surface p-1"
    >
      {(["component", "student"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          onClick={() => {
            onModeChange(value);
          }}
          className={cn(
            "min-h-9 rounded-xs px-3 text-[13px] font-medium transition-colors",
            mode === value ? "bg-accent text-accent-fg" : "text-fg-muted",
          )}
        >
          {t(`entryMode.${value}`)}
        </button>
      ))}
    </div>
  );
}
