"use client";

import { cn } from "@newsekolah/ui";
import { AlertTriangle, Copy, Pencil, Trash2 } from "lucide-react";
import type { ReactElement } from "react";

import type { ScheduleBlock } from "../api";
import { blockCrossesBreak } from "../break-warning";

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
 * at a time as a vertical list instead.
 */
/** A labelled action on an agenda row, thumb-sized because it is tapped. */
function AgendaAction({
  label,
  icon,
  danger,
  onClick,
}: {
  label: string;
  icon: ReactElement;
  danger?: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center gap-1 px-1 text-[12px] text-fg-muted",
        danger ? "hover:text-status-absent" : "hover:text-fg",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

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
  /** Today's weekday (1-7), marked on its chip so a teacher finds it at once. */
  today: number;
  /** The period in session right now, highlighted when showing today. */
  currentSeq?: number;
  t: (key: string) => string;
  tDays: (key: string) => string;
}): ReactElement {
  const periodBySeq = new Map(lessonPeriods.map((p) => [p.sequence, p]));
  const hasLessons = lessonPeriods.some((p) => blocks.has(`${mobileDay}:${p.sequence}`));
  const nowSeq = mobileDay === today ? currentSeq : undefined;

  return (
    <div className="flex flex-col gap-3 md:hidden">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {activeDays.map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={mobileDay === day}
            onClick={() => {
              onSelectDay(day);
            }}
            className={cn(
              "flex min-h-11 shrink-0 flex-col items-center justify-center rounded-xs px-3 text-[13px] font-medium",
              mobileDay === day ? "bg-accent/10 text-accent" : "text-fg-muted hover:bg-bg",
            )}
          >
            {tDays(String(day))}
            {day === today && (
              <span className="text-[10px] font-normal leading-none">{t("today")}</span>
            )}
          </button>
        ))}
      </div>
      {!canManage && !hasLessons && (
        <p className="rounded-xs border border-dashed border-border px-3 py-6 text-center text-[13px] text-fg-muted">
          {t("noLessonsOnDay")}
        </p>
      )}
      <ul className={cn("flex flex-col gap-2", !canManage && !hasLessons && "hidden")}>
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
                className="rounded-xs border border-border bg-bg/60 px-3 py-2 text-[12px] text-fg-muted"
              >
                {period.name}
              </li>
            );
          }
          const time = `${period.starts_at.slice(0, 5)}-${period.ends_at.slice(0, 5)}`;
          if (!block) {
            // A reader who cannot edit only needs to see the gap, so an
            // empty period is a single muted line instead of a full card.
            if (!canManage) {
              return (
                <li
                  key={period.id}
                  className="flex items-center justify-between rounded-xs border border-border px-3 py-2 text-[12px] text-fg-muted"
                >
                  <span>
                    {period.name} <span className="tabular-nums">{time}</span>
                  </span>
                  <span>{t("emptySlot")}</span>
                </li>
              );
            }
            return (
              <li key={period.id} className="rounded-xs border border-border px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-[13px] text-fg">{period.name}</span>
                  <span className="text-[12px] text-fg-muted">{time}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (copied) {
                      onPaste(mobileDay, period.sequence);
                      return;
                    }
                    onAdd(mobileDay, period.sequence);
                  }}
                  className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xs border border-dashed border-border text-[12px] text-fg-muted hover:bg-bg"
                >
                  {copied ? t("pasteHere") : t("addHere")}
                </button>
              </li>
            );
          }
          const title =
            mode === "class"
              ? (teacherMap.get(block.teacher_user_id)?.name ?? t("unknownTeacher"))
              : (classMap.get(block.class_id)?.name ?? t("unknownClass"));
          // A block may span several periods; its label and time run from
          // the first period's start to the last period's end.
          const endPeriod = periodBySeq.get(block.end_seq) ?? period;
          const spanLabel =
            endPeriod.sequence === period.sequence
              ? period.name
              : `${period.name} - ${endPeriod.name}`;
          const spanTime = `${period.starts_at.slice(0, 5)}-${endPeriod.ends_at.slice(0, 5)}`;
          const isNow =
            nowSeq !== undefined && nowSeq >= block.start_seq && nowSeq <= block.end_seq;
          return (
            <li
              key={period.id}
              aria-current={isNow ? "time" : undefined}
              className={cn(
                "flex flex-col gap-1 rounded-xs border px-3 py-2",
                isNow ? "border-accent bg-accent/15" : "border-accent/30 bg-accent/10",
              )}
            >
              <div className="flex items-center justify-between gap-2 text-[12px] text-fg-muted">
                <span>
                  {spanLabel} <span className="tabular-nums">{spanTime}</span>
                </span>
                {isNow && <span className="font-medium text-accent">{t("now")}</span>}
              </div>
              <span className="flex items-center gap-1.5 text-[15px] font-medium text-fg">
                <span className="truncate">
                  {subjectMap.get(block.subject_id)?.name ?? t("unknownSubject")}
                </span>
                {blockCrossesBreak(block, lessonPeriods) && (
                  <span
                    role="img"
                    aria-label={t("crossesBreakWarning")}
                    title={t("crossesBreakWarning")}
                    className="inline-flex shrink-0 text-status-late"
                  >
                    <AlertTriangle className="size-3.5" aria-hidden="true" />
                  </span>
                )}
              </span>
              <span className="text-[13px] text-fg-muted">{title}</span>
              {canManage && (
                // The same three actions the wide grid offers. A phone is
                // where a teacher fixes one lesson between classes, so
                // leaving copy and edit out of it made the small screen the
                // only place the job could not be done.
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <AgendaAction
                    label={t("copyBlock")}
                    icon={<Copy className="size-3.5" aria-hidden="true" />}
                    onClick={() => {
                      onCopy(block);
                    }}
                  />
                  <AgendaAction
                    label={t("editBlock")}
                    icon={<Pencil className="size-3.5" aria-hidden="true" />}
                    onClick={() => {
                      onEdit(block);
                    }}
                  />
                  <AgendaAction
                    label={t("deleteBlock")}
                    danger
                    icon={<Trash2 className="size-3.5" aria-hidden="true" />}
                    onClick={() => {
                      onDelete(block);
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
