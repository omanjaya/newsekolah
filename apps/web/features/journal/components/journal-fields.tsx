"use client";

import { Input, Textarea } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * The three journal fields (topic, activities, reflection) shared by every
 * entry point: the standalone quick-fill dialog on `/journal`
 * (`JournalForm`) and the "Jurnal" tab inside an attendance session
 * (`SessionJournalPanel`). Kept as one component precisely so both behave
 * identically -- the same labels, placeholders, and "previous meeting's
 * topic" suggestion -- rather than two forms that quietly drift apart.
 */
export function JournalFields({
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
  const t = useTranslations("app.journal.fields");
  return (
    <div className="flex flex-col gap-3">
      {previousTopic && (
        <p className="text-[13px] text-fg-muted">
          {t("previousTopic")}: {previousTopic}
        </p>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("topic")}</span>
        <Input
          value={topic}
          onChange={(e) => {
            onTopicChange(e.target.value);
          }}
          placeholder={t("topicPlaceholder")}
          disabled={disabled}
          aria-label={t("topic")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("activities")}</span>
        <Textarea
          rows={3}
          value={activities}
          onChange={(e) => {
            onActivitiesChange(e.target.value);
          }}
          placeholder={t("activitiesPlaceholder")}
          disabled={disabled}
          aria-label={t("activities")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("reflection")}</span>
        <Textarea
          rows={2}
          value={reflection}
          onChange={(e) => {
            onReflectionChange(e.target.value);
          }}
          placeholder={t("reflectionPlaceholder")}
          disabled={disabled}
          aria-label={t("reflection")}
        />
      </label>
    </div>
  );
}
