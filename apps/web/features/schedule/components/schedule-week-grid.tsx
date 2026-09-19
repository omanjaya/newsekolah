"use client";

import { cn } from "@newsekolah/ui";
import type { ReactElement } from "react";

import type { ScheduleBlock } from "../api";

import {
  BREAK_ROW,
  EmptyCell,
  EmptySlotCell,
  GridColumns,
  HeadCell,
  LESSON_ROW,
  LessonCell,
  type Named,
  type Period,
  PeriodCell,
  gridMinWidth,
} from "./schedule-grid-cells";

/**
 * One class or one teacher across the week. Rows are periods, columns are
 * the days the school runs. The caller mounts this only at md and above,
 * where the agenda takes over below it; the `md:block` here is a defensive
 * fallback for the brief window before the caller's media query sync
 * lands, not the mechanism that hides the other layout.
 */
/** 1 (Monday) through 7 (Sunday), matching the schedule's own numbering. */
function todayOfWeek(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function ScheduleWeekGrid({
  activeDays,
  lessonPeriods,
  blocks,
  mode,
  teacherMap,
  classMap,
  subjectMap,
  canManage,
  copied,
  onAdd,
  onPaste,
  onCopy,
  onEdit,
  onDelete,
  t,
  tDays,
  currentSeq,
}: {
  activeDays: readonly number[];
  lessonPeriods: Period[];
  /** Lesson blocks keyed by `${dayOfWeek}:${sequence}`, one entry per
   * period the block spans, so a cell looks itself up in O(1). */
  blocks: Map<string, ScheduleBlock>;
  mode: "class" | "teacher";
  teacherMap: Map<string, Named>;
  classMap: Map<string, Named>;
  subjectMap: Map<string, Named>;
  canManage: boolean;
  copied: ScheduleBlock | null;
  onAdd: (day: number, startSeq: number) => void;
  onPaste: (day: number, startSeq: number) => void;
  onCopy: (block: ScheduleBlock) => void;
  onEdit: (block: ScheduleBlock) => void;
  onDelete: (block: ScheduleBlock) => void;
  t: (key: string) => string;
  tDays: (key: string) => string;
  /** Sequence of the period in session right now, when there is one. */
  currentSeq?: number;
}): ReactElement {
  // A timetable is opened to answer "where am I now" before anything
  // else, and a week grid says nothing about that on its own.
  const today = todayOfWeek();

  return (
    <div className="hidden overflow-x-auto rounded-sm border border-border bg-surface md:block">
      <table
        className="w-full table-fixed border-collapse text-[13px]"
        style={{ minWidth: gridMinWidth(activeDays.length) }}
      >
        <GridColumns columnCount={activeDays.length} />
        <thead>
          <tr className="bg-bg text-left text-fg-muted">
            <HeadCell first>{t("periodColumn")}</HeadCell>
            {activeDays.map((day) => (
              <HeadCell key={day} current={day === today}>
                {tDays(String(day))}
              </HeadCell>
            ))}
          </tr>
        </thead>
        <tbody>
          {lessonPeriods.map((period) => (
            <tr key={period.id} className={cn(period.is_break ? BREAK_ROW : LESSON_ROW)}>
              <PeriodCell period={period} current={period.sequence === currentSeq} />
              {activeDays.map((day) => {
                const block = blocks.get(`${day}:${period.sequence}`);
                // A cell already covered by a block that started in
                // an earlier row emits nothing, break or not.
                // Emitting one anyway pushed every later cell in the
                // row one column to the right.
                if (block && block.start_seq !== period.sequence) {
                  return null;
                }
                if (period.is_break) {
                  return <EmptyCell key={day} today={day === today} />;
                }
                if (!block) {
                  if (!canManage) {
                    return <EmptyCell key={day} today={day === today} />;
                  }
                  return (
                    <EmptySlotCell
                      key={day}
                      today={day === today}
                      pasting={copied !== null}
                      label={copied ? t("pasteHere") : t("addHere")}
                      onClick={() => {
                        if (copied) {
                          onPaste(day, period.sequence);
                          return;
                        }
                        onAdd(day, period.sequence);
                      }}
                    />
                  );
                }
                return (
                  <LessonCell
                    key={day}
                    today={day === today}
                    block={block}
                    span={block.end_seq - block.start_seq + 1}
                    subject={subjectMap.get(block.subject_id)?.name ?? t("unknownSubject")}
                    detail={
                      mode === "class"
                        ? (teacherMap.get(block.teacher_user_id)?.name ?? t("unknownTeacher"))
                        : (classMap.get(block.class_id)?.name ?? t("unknownClass"))
                    }
                    canManage={canManage}
                    onCopy={onCopy}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    t={t}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
