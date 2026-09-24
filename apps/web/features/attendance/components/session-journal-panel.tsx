"use client";

import { Input, Textarea } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * The teaching journal, split from the roster into its own tab
 * (docs/07-ui-ux.md: "jurnal di bawah... tidak jelas apakah tersimpan
 * bersama presensi"). It shares one submit with the roster (see
 * `session-editor.tsx`), so this panel only owns the three fields and
 * shows the previous meeting's topic as a starting suggestion.
 */
export function SessionJournalPanel({
  previousTopic,
  topic,
  activities,
  reflection,
  disabled,
  onTopicChange,
  onActivitiesChange,
  onReflectionChange,
}: {
  previousTopic?: string;
  topic: string;
  activities: string;
  reflection: string;
  disabled: boolean;
  onTopicChange: (value: string) => void;
  onActivitiesChange: (value: string) => void;
  onReflectionChange: (value: string) => void;
}): ReactElement {
  const t = useTranslations("app.attendance.session");
  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      {previousTopic && (
        <p className="text-[13px] text-fg-muted">
          {t("previousTopic")}: {previousTopic}
        </p>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("journalTopic")}</span>
        <Input
          value={topic}
          onChange={(e) => {
            onTopicChange(e.target.value);
          }}
          disabled={disabled}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("journalActivities")}</span>
        <Textarea
          rows={3}
          value={activities}
          onChange={(e) => {
            onActivitiesChange(e.target.value);
          }}
          disabled={disabled}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("journalReflection")}</span>
        <Textarea
          rows={2}
          value={reflection}
          onChange={(e) => {
            onReflectionChange(e.target.value);
          }}
          disabled={disabled}
        />
      </label>
    </section>
  );
}
