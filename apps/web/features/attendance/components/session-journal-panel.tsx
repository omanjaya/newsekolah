"use client";

import type { ReactElement } from "react";

import { JournalFields } from "../../journal/components/journal-fields";

/**
 * The teaching journal, split from the roster into its own tab
 * (docs/07-ui-ux.md: "jurnal di bawah... tidak jelas apakah tersimpan
 * bersama presensi"). It shares one submit with the roster (see
 * `session-editor.tsx`), so this panel is just a thin wrapper around
 * {@link JournalFields} -- the same three fields the standalone quick-fill
 * form on `/journal` uses, so both entry points behave identically.
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
  return (
    <section className="rounded-sm border border-border bg-surface p-4">
      <JournalFields
        previousTopic={previousTopic}
        topic={topic}
        activities={activities}
        reflection={reflection}
        disabled={disabled}
        onTopicChange={onTopicChange}
        onActivitiesChange={onActivitiesChange}
        onReflectionChange={onReflectionChange}
      />
    </section>
  );
}
