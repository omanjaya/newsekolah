"use client";

import { Card, cn, Table } from "@newsekolah/ui";
import { useFormatter } from "next-intl";
import type { ReactElement } from "react";

import { formatCalendarDate } from "../../../lib/format-calendar-date";
import { useSession } from "../../../lib/session/session-provider";
import { useSimulation } from "../../../lib/simulation/clock";
import { isoWeekdayOf, todayInZone } from "../../../lib/tenant-date";
import type { ScheduleBlock } from "../api";
import { blockCrossesBreak } from "../break-warning";
import { isCurrentPeriodCell, isNowWithinBlock } from "../current-period";
import { periodSpan } from "../period-span";
import { useBlockLock } from "../use-block-lock";
import { useEffectiveCaption } from "../use-effective-caption";
import { cellDate, inWeek } from "../week";

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
 * One class or one teacher across one week (`weekStart`, a Monday): rows
 * are periods, columns are the days the school runs, each headed with its
 * date, and each day shows the lessons in effect on that date. Today's
 * column and the period in session are marked only in the current week.
 * The caller mounts this only at md and above, where the agenda takes over
 * below it; the `md:block` here is a defensive fallback for the brief
 * window before the caller's media query sync lands, not the mechanism
 * that hides the other layout.
 */
export function ScheduleWeekGrid({
  weekStart,
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
  /** The Monday of the week shown. */
  weekStart: string;
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
  useSimulation();
  const { me } = useSession();
  const format = useFormatter();
  const captionOf = useEffectiveCaption(weekStart);
  const lockOf = useBlockLock();
  const todayIso = todayInZone(me?.tenant.timezone);
  // Outside the current week no column is today's.
  const today = inWeek(weekStart, todayIso) ? isoWeekdayOf(todayIso) : 0;
  const weekCurrentSeq = today === 0 ? undefined : currentSeq;

  return (
    // As tall as the page leaves it on desktop: the grid scrolls inside the
    // card, under day headings that stay in view.
    <Card className="hidden min-h-0 overflow-hidden p-0 md:flex md:flex-col">
      <div className="min-h-0 overflow-auto">
        <Table
          framed={false}
          className="table-fixed"
          style={{ minWidth: gridMinWidth(activeDays.length) }}
        >
          <GridColumns columnCount={activeDays.length} />
          <thead>
            <tr className="text-left text-fg-muted">
              <HeadCell first>{t("periodColumn")}</HeadCell>
              {activeDays.map((day) => (
                <HeadCell
                  key={day}
                  current={day === today}
                  date={formatCalendarDate(format, cellDate(weekStart, day), {
                    day: "numeric",
                    month: "short",
                  })}
                >
                  {tDays(String(day))}
                </HeadCell>
              ))}
            </tr>
          </thead>
          <tbody>
            {lessonPeriods.map((period) => (
              <tr key={period.id} className={cn(period.is_break ? BREAK_ROW : LESSON_ROW)}>
                <PeriodCell period={period} current={period.sequence === weekCurrentSeq} />
                {activeDays.map((day) => {
                  const block = blocks.get(`${day}:${period.sequence}`);
                  const isCurrent = isCurrentPeriodCell(
                    day,
                    today,
                    period.sequence,
                    weekCurrentSeq,
                  );
                  // A cell already covered by a block that started in
                  // an earlier row emits nothing, break or not.
                  // Emitting one anyway pushed every later cell in the
                  // row one column to the right.
                  if (block && block.start_seq !== period.sequence) {
                    return null;
                  }
                  // A block is drawn from its first row even when that row is
                  // a break: timetables imported against another period
                  // template can start on one, and skipping it left a hole
                  // that shifted every cell after it.
                  if (!block) {
                    if (period.is_break || !canManage) {
                      return <EmptyCell key={day} today={day === today} current={isCurrent} />;
                    }
                    return (
                      <EmptySlotCell
                        key={day}
                        today={day === today}
                        current={isCurrent}
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
                      current={
                        day === today &&
                        isNowWithinBlock(block.start_seq, block.end_seq, weekCurrentSeq)
                      }
                      block={block}
                      span={periodSpan(block)}
                      subject={subjectMap.get(block.subject_id)?.name ?? t("unknownSubject")}
                      detail={
                        mode === "class"
                          ? (teacherMap.get(block.teacher_user_id)?.name ?? t("unknownTeacher"))
                          : (classMap.get(block.class_id)?.name ?? t("unknownClass"))
                      }
                      canManage={canManage}
                      crossesBreak={blockCrossesBreak(block, lessonPeriods)}
                      breakWarningLabel={t("crossesBreakWarning")}
                      caption={captionOf(block)}
                      lock={lockOf(block)}
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
        </Table>
      </div>
    </Card>
  );
}
