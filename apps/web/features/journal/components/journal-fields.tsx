"use client";

import { Input, Textarea, Field } from "@newsekolah/ui";
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
  requiredError,
}: {
  previousTopic?: string;
  topic: string;
  activities: string;
  reflection: string;
  disabled: boolean;
  onTopicChange: (value: string) => void;
  onActivitiesChange: (value: string) => void;
  onReflectionChange: (value: string) => void;
  /**
   * Marks topic and activities required and returns the error to show
   * for a value (the quick-fill form passes it once Submit was pressed).
   */
  requiredError?: (value: string) => string | undefined;
}): ReactElement {
  const t = useTranslations("app.journal.fields");
  return (
    <div className="flex flex-col gap-3">
      {previousTopic && (
        <p className="text-body-sm text-fg-muted">
          {t("previousTopic")}: {previousTopic}
        </p>
      )}
      <Field label={t("topic")} required={!!requiredError} error={requiredError?.(topic)}>
        <Input
          value={topic}
          onChange={(e) => {
            onTopicChange(e.target.value);
          }}
          placeholder={t("topicPlaceholder")}
          disabled={disabled}
          aria-label={t("topic")}
        />
      </Field>
      <Field label={t("activities")} required={!!requiredError} error={requiredError?.(activities)}>
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
      </Field>
      <Field label={t("reflection")}>
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
      </Field>
    </div>
  );
}
