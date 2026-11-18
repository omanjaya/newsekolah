"use client";

import { SegmentedControl } from "@newsekolah/ui";
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
    <SegmentedControl<GradebookEntryMode>
      aria-label={t("entryMode.label")}
      value={mode}
      onValueChange={onModeChange}
      className="shrink-0"
      options={[
        { value: "component", label: t("entryMode.componentShort") },
        { value: "student", label: t("entryMode.studentShort") },
      ]}
    />
  );
}
