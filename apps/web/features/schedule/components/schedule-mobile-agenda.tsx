"use client";

import { cn } from "@newsekolah/ui";
import { Trash2 } from "lucide-react";
import type { ReactElement } from "react";

import type { ScheduleBlock } from "../api";

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
export function ScheduleMobileAgenda({
  activeDays,
  lessonPeriods,
  blockAt,
  mode,
  teacherMap,
  classMap,
  subjectMap,
  canManage,
  mobileDay,
  onSelectDay,
  onAdd,
  onDelete,
  t,
  tDays,
}: {
  activeDays: readonly number[];
  lessonPeriods: Period[];
  blockAt: (day: number, seq: number) => ScheduleBlock | undefined;
  mode: "class" | "teacher";
  teacherMap: NamedLookup;
  classMap: NamedLookup;
  subjectMap: NamedLookup;
  canManage: boolean;
  mobileDay: number;
  onSelectDay: (day: number) => void;
  onAdd: (day: number, startSeq: number) => void;
  onDelete: (block: ScheduleBlock) => void;
  t: (key: string) => string;
  tDays: (key: string) => string;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3 md:hidden">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {activeDays.map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={mobileDay === day}
            onClick={() => {
              onSelectDay(day);
            }}
            className={cn(
              "flex min-h-11 shrink-0 items-center justify-center rounded-xs px-3 text-[13px] font-medium",
              mobileDay === day ? "bg-accent/10 text-accent" : "text-fg-muted hover:bg-bg",
            )}
          >
            {tDays(String(day))}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {lessonPeriods.map((period) => {
          if (period.is_break) {
            return (
              <li
                key={period.id}
                className="rounded-xs border border-border bg-bg/60 px-3 py-2 text-[12px] text-fg-muted"
              >
                {period.name}
              </li>
            );
          }
          const block = blockAt(mobileDay, period.sequence);
          if (block && block.start_seq !== period.sequence) {
            return null;
          }
          if (!block) {
            return (
              <li key={period.id} className="rounded-xs border border-border px-3 py-2">
                <div className="flex flex-col">
                  <span className="text-[13px] text-fg">{period.name}</span>
                  <span className="text-[12px] text-fg-muted">
                    {period.starts_at.slice(0, 5)}-{period.ends_at.slice(0, 5)}
                  </span>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(mobileDay, period.sequence);
                    }}
                    className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xs border border-dashed border-border text-[12px] text-fg-muted hover:bg-bg"
                  >
                    {t("addHere")}
                  </button>
                )}
              </li>
            );
          }
          const title =
            mode === "class"
              ? (teacherMap.get(block.teacher_user_id)?.name ?? t("unknownTeacher"))
              : (classMap.get(block.class_id)?.name ?? t("unknownClass"));
          return (
            <li
              key={period.id}
              className="flex flex-col gap-1 rounded-xs border border-accent/30 bg-accent/10 px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-[13px] text-fg-muted">{period.name}</span>
                <span className="text-[12px] text-fg-muted">
                  {period.starts_at.slice(0, 5)}-{period.ends_at.slice(0, 5)}
                </span>
              </div>
              <span className="font-medium text-fg">
                {subjectMap.get(block.subject_id)?.name ?? t("unknownSubject")}
              </span>
              <span className="text-[12px] text-fg-muted">{title}</span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(block);
                  }}
                  aria-label={t("deleteBlock")}
                  className="mt-1 flex min-h-11 items-center gap-1 self-start px-1 text-[12px] text-fg-muted hover:text-status-absent"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  {t("deleteBlock")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
