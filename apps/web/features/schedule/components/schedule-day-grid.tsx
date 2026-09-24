"use client";

import type { ReactElement } from "react";

import type { ScheduleBlock } from "../api";
import { blockCrossesBreak } from "../break-warning";

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
 * One day, every class side by side. This is the view someone building a
 * timetable actually works in: a clash is two lessons on the same row,
 * and a hole is an empty cell, both visible without changing anything.
 * The week-for-one-class view answers a different question, so the two
 * live alongside each other rather than one replacing the other.
 */
export function ScheduleDayGrid({
  classes,
  lessonPeriods,
  blocks,
  teacherMap,
  subjectMap,
  canManage,
  copied,
  onAdd,
  onPaste,
  onCopy,
  onEdit,
  onDelete,
  t,
  currentSeq,
}: {
  classes: Named[];
  lessonPeriods: Period[];
  /** Lesson blocks keyed by `${classId}:${sequence}`, one entry per period
   * the block spans, so a cell looks itself up in O(1). */
  blocks: Map<string, ScheduleBlock>;
  teacherMap: Map<string, Named>;
  subjectMap: Map<string, Named>;
  canManage: boolean;
  copied: ScheduleBlock | null;
  onAdd: (classId: string, startSeq: number) => void;
  onPaste: (classId: string, startSeq: number) => void;
  onCopy: (block: ScheduleBlock) => void;
  onEdit: (block: ScheduleBlock) => void;
  onDelete: (block: ScheduleBlock) => void;
  t: (key: string) => string;
  /** Sequence of the period in session now, when the day shown is today. */
  currentSeq?: number;
}): ReactElement {
  return (
    <div className="hidden overflow-x-auto rounded-sm border border-border bg-surface md:block">
      <table
        className="w-full table-fixed border-collapse text-[13px]"
        style={{ minWidth: gridMinWidth(classes.length) }}
      >
        <GridColumns columnCount={classes.length} />
        <thead>
          <tr className="bg-bg text-left text-fg-muted">
            <HeadCell first>{t("periodColumn")}</HeadCell>
            {classes.map((classItem) => (
              <HeadCell key={classItem.id}>{classItem.name}</HeadCell>
            ))}
          </tr>
        </thead>
        <tbody>
          {lessonPeriods.map((period) => (
            <tr key={period.id} className={period.is_break ? BREAK_ROW : LESSON_ROW}>
              <PeriodCell period={period} current={period.sequence === currentSeq} />
              {classes.map((classItem) => {
                const block = blocks.get(`${classItem.id}:${period.sequence}`);
                if (block && block.start_seq !== period.sequence) return null;
                // Drawn from its first row even on a break; see
                // schedule-week-grid.tsx for why.
                if (!block) {
                  if (period.is_break || !canManage) {
                    return <EmptyCell key={classItem.id} />;
                  }
                  return (
                    <EmptySlotCell
                      key={classItem.id}
                      pasting={copied !== null}
                      label={copied ? t("pasteHere") : t("addHere")}
                      onClick={() => {
                        if (copied) {
                          onPaste(classItem.id, period.sequence);
                          return;
                        }
                        onAdd(classItem.id, period.sequence);
                      }}
                    />
                  );
                }
                return (
                  <LessonCell
                    key={classItem.id}
                    block={block}
                    span={block.end_seq - block.start_seq + 1}
                    subject={subjectMap.get(block.subject_id)?.name ?? t("unknownSubject")}
                    detail={teacherMap.get(block.teacher_user_id)?.name ?? t("unknownTeacher")}
                    canManage={canManage}
                    crossesBreak={blockCrossesBreak(block, lessonPeriods)}
                    breakWarningLabel={t("crossesBreakWarning")}
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
