"use client";

import {
  Badge,
  Button,
  EmptyState,
  RowActionsMenu,
  SectionHeader,
  SegmentedControl,
  cn,
} from "@newsekolah/ui";
import { AlertTriangle, Copy, Dot, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { ScheduleBlock } from "../api";
import { blockCrossesBreak } from "../break-warning";
import { clockLabel } from "../clock-label";
import { isNowWithinBlock } from "../current-period";
import { SUBJECT_TONE_CLASSES, subjectTone } from "../subject-tone";

import { LessonSubstitutionAction } from "./lesson-substitution-action";

type NamedLookup = Map<string, { name: string }>;

interface Period {
  id: string;
  name: string;
  sequence: number;
  starts_at: string;
  ends_at: string;
  is_break: boolean;
}

/**
 * Mobile counterpart to the weekly grid in `ScheduleView`. A 7-column table
 * has no honest reflow on a phone -- it either collapses columns to slivers
 * or forces sideways scroll through the whole week -- so this shows one day
 * at a time: the whole week as one row of short day names (today marked),
 * then that day's lessons with their time leading, in their subject's
 * colour.
 */
export function ScheduleMobileAgenda({
  activeDays,
  lessonPeriods,
  blocks,
  mode,
  teacherMap,
  classMap,
  subjectMap,
  canManage,
  mobileDay,
  onSelectDay,
  onAdd,
  onPaste,
  onCopy,
  onEdit,
  onDelete,
  copied,
  today,
  currentSeq,
  t,
  tDays,
}: {
  activeDays: readonly number[];
  lessonPeriods: Period[];
  /** Lesson blocks keyed by `${dayOfWeek}:${sequence}`, one entry per
   * period the block spans, so a row looks itself up in O(1). */
  blocks: Map<string, ScheduleBlock>;
  mode: "class" | "teacher";
  teacherMap: NamedLookup;
  classMap: NamedLookup;
  subjectMap: NamedLookup;
  canManage: boolean;
  mobileDay: number;
  onSelectDay: (day: number) => void;
  onAdd: (day: number, startSeq: number) => void;
  onPaste: (day: number, startSeq: number) => void;
  onCopy: (block: ScheduleBlock) => void;
  onEdit: (block: ScheduleBlock) => void;
  onDelete: (block: ScheduleBlock) => void;
  copied: ScheduleBlock | null;
  /** Today's weekday (1-7), marked in the day row so a teacher finds it at once. */
  today: number;
  /** The period in session right now, highlighted when showing today. */
  currentSeq?: number;
  t: (key: string) => string;
  tDays: (key: string) => string;
}): ReactElement {
  const tShort = useTranslations("app.common.weekdaysShort");
  const locale = useLocale();
  const periodBySeq = new Map(lessonPeriods.map((p) => [p.sequence, p]));
  const hasLessons = lessonPeriods.some((p) => blocks.has(`${mobileDay}:${p.sequence}`));
  const nowSeq = mobileDay === today ? currentSeq : undefined;

  return (
    <div className="flex flex-col gap-4 md:hidden">
      {/* Seven short names share the width; the dense size lets the whole
          week fit a 390px phone without scrolling. */}
      <SegmentedControl
        aria-label={t("pickDay")}
        value={String(mobileDay)}
        onValueChange={(value) => {
          onSelectDay(Number(value));
        }}
        size="dense"
        fullWidth
        options={activeDays.map((day) => ({
          value: String(day),
          label: tShort(String(day)),
          icon: day === today ? <Dot className="-mx-1.5 text-accent" /> : undefined,
        }))}
      />
      <SectionHeader
        title={
          mobileDay === today
            ? `${tDays(String(mobileDay))} · ${t("today")}`
            : tDays(String(mobileDay))
        }
      />
      {!canManage && !hasLessons ? (
        <EmptyState
          variant="compact"
          icon={<Dot aria-hidden="true" />}
          title={t("noLessonsOnDay")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {lessonPeriods.map((period) => {
            const block = blocks.get(`${mobileDay}:${period.sequence}`);
            if (block && block.start_seq !== period.sequence) {
              return null;
            }
            // A block starting on a break row (possible with imported
            // timetables) is still listed rather than hidden behind it.
            if (period.is_break && !block) {
              return (
                <li
                  key={period.id}
                  className="flex items-center gap-3 px-4 py-1 text-caption text-fg-muted"
                >
                  <span className="w-12 tabular-nums">{clockLabel(period.starts_at, locale)}</span>
                  <span className="h-px flex-1 bg-line" aria-hidden="true" />
                  <span>{period.name}</span>
                </li>
              );
            }
            if (!block) {
              // A reader who cannot edit only needs to see the gap, so an
              // empty period is one muted line instead of a full card.
              return (
                <li
                  key={period.id}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-dashed border-border px-4 py-1.5 text-body-sm text-fg-muted"
                >
                  <span className="w-12 shrink-0 tabular-nums">
                    {clockLabel(period.starts_at, locale)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{period.name}</span>
                  {canManage ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Plus />}
                      onClick={() => {
                        if (copied) {
                          onPaste(mobileDay, period.sequence);
                          return;
                        }
                        onAdd(mobileDay, period.sequence);
                      }}
                    >
                      {copied ? t("pasteHere") : t("addHere")}
                    </Button>
                  ) : (
                    <span className="text-caption">{t("emptySlot")}</span>
                  )}
                </li>
              );
            }
            const detail =
              mode === "class"
                ? (teacherMap.get(block.teacher_user_id)?.name ?? t("unknownTeacher"))
                : (classMap.get(block.class_id)?.name ?? t("unknownClass"));
            // A block may span several periods; its label and time run from
            // the first period's start to the last period's end.
            const endPeriod = periodBySeq.get(block.end_seq) ?? period;
            const spanLabel =
              endPeriod.sequence === period.sequence
                ? period.name
                : `${period.name} – ${endPeriod.name}`;
            const isNow = isNowWithinBlock(block.start_seq, block.end_seq, nowSeq);
            const subject = subjectMap.get(block.subject_id)?.name ?? t("unknownSubject");
            return (
              <li
                key={period.id}
                aria-current={isNow ? "time" : undefined}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-4 py-3",
                  SUBJECT_TONE_CLASSES[subjectTone(block.subject_id)],
                  // Same accent-edge language as the desktop grid's
                  // current-period cell, adapted to a card.
                  isNow && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
                )}
              >
                <span className="flex w-12 shrink-0 flex-col pt-0.5 text-label tabular-nums">
                  {clockLabel(period.starts_at, locale)}
                  <span className="text-caption font-normal opacity-80">
                    {clockLabel(endPeriod.ends_at, locale)}
                  </span>
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-heading">{subject}</span>
                    {blockCrossesBreak(block, lessonPeriods) && (
                      <span
                        role="img"
                        aria-label={t("crossesBreakWarning")}
                        title={t("crossesBreakWarning")}
                        className="inline-flex shrink-0 text-warning"
                      >
                        <AlertTriangle className="size-3.5" aria-hidden="true" />
                      </span>
                    )}
                    {isNow && (
                      <Badge tone="accent" size="sm" dot className="ml-auto">
                        {t("now")}
                      </Badge>
                    )}
                  </span>
                  <span className="text-body-sm opacity-90">
                    {detail} · {spanLabel}
                  </span>
                  <div className="-ml-3 empty:hidden">
                    <LessonSubstitutionAction block={block} />
                  </div>
                </div>
                {canManage && (
                  // The same three actions the wide grid offers. A phone is
                  // where a teacher fixes one lesson between classes.
                  <RowActionsMenu
                    ariaLabel={t("blockActions")}
                    items={[
                      {
                        label: t("copyBlock"),
                        icon: <Copy />,
                        onClick: () => {
                          onCopy(block);
                        },
                      },
                      {
                        label: t("editBlock"),
                        icon: <Pencil />,
                        onClick: () => {
                          onEdit(block);
                        },
                      },
                      {
                        label: t("deleteBlock"),
                        icon: <Trash2 />,
                        tone: "danger",
                        onClick: () => {
                          onDelete(block);
                        },
                      },
                    ]}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
