"use client";

import { cn } from "@newsekolah/ui";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { ReactElement } from "react";

import type { ScheduleBlock } from "../api";

import { BlockAction } from "./block-action";

interface Named {
  id: string;
  name: string;
}

interface Period {
  id: string;
  name: string;
  sequence: number;
  starts_at: string;
  ends_at: string;
  is_break: boolean;
}

/**
 * One class or one teacher across the week. Rows are periods, columns are
 * the days the school runs. Hidden below md, where the agenda takes over.
 */
/** 1 (Monday) through 7 (Sunday), matching the schedule's own numbering. */
function todayOfWeek(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function ScheduleWeekGrid({
  hidden,
  activeDays,
  lessonPeriods,
  blockAt,
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
  hidden: boolean;
  activeDays: readonly number[];
  lessonPeriods: Period[];
  blockAt: (day: number, seq: number) => ScheduleBlock | undefined;
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
    <div
      className={cn(
        "overflow-x-auto rounded-sm border border-border bg-surface",
        hidden ? "hidden" : "hidden md:block",
      )}
    >
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-bg text-left text-fg-muted">
            <th scope="col" className="w-28 border-b border-border px-3 py-2 font-medium">
              {t("periodColumn")}
            </th>
            {activeDays.map((day) => (
              <th
                key={day}
                scope="col"
                aria-current={day === today ? "date" : undefined}
                className={cn(
                  "border-b border-l border-border px-3 py-2 font-medium",
                  day === today && "bg-accent/10 text-fg",
                )}
              >
                {tDays(String(day))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lessonPeriods.map((period) => (
            <tr
              key={period.id}
              className={cn(
                period.is_break && "bg-bg/60",
                period.sequence === currentSeq && "bg-accent/5",
              )}
            >
              <th scope="row" className="border-b border-border px-3 py-2 text-left font-normal">
                <div className="flex flex-col">
                  <span className="text-fg">{period.name}</span>
                  <span className="text-[12px] text-fg-muted">
                    {period.starts_at.slice(0, 5)}-{period.ends_at.slice(0, 5)}
                  </span>
                </div>
              </th>
              {activeDays.map((day) => {
                const block = blockAt(day, period.sequence);
                // A cell already covered by a block that started in
                // an earlier row emits nothing, break or not.
                // Emitting one anyway pushed every later cell in the
                // row one column to the right.
                if (block && block.start_seq !== period.sequence) {
                  return null;
                }
                if (period.is_break) {
                  return (
                    <td
                      key={day}
                      className="border-b border-l border-border px-3 py-2 text-fg-muted"
                    />
                  );
                }
                if (!block) {
                  return (
                    <td key={day} className="border-b border-l border-border px-2 py-1 align-top">
                      {canManage && (
                        // Visible without hovering: a tablet has no
                        // hover, and an invisible control is one
                        // nobody finds.
                        <button
                          type="button"
                          onClick={() => {
                            if (copied) {
                              onPaste(day, period.sequence);
                              return;
                            }
                            onAdd(day, period.sequence);
                          }}
                          className="flex h-full min-h-10 w-full items-center justify-center gap-1 rounded-xs border border-dashed border-border text-[12px] text-fg-muted hover:border-accent hover:bg-accent/5 hover:text-accent"
                        >
                          {copied ? (
                            <Copy className="size-3.5" aria-hidden="true" />
                          ) : (
                            <Plus className="size-3.5" aria-hidden="true" />
                          )}
                          {copied ? t("pasteHere") : t("addHere")}
                        </button>
                      )}
                    </td>
                  );
                }
                const span = block.end_seq - block.start_seq + 1;
                const title =
                  mode === "class"
                    ? (teacherMap.get(block.teacher_user_id)?.name ?? t("unknownTeacher"))
                    : (classMap.get(block.class_id)?.name ?? t("unknownClass"));
                return (
                  <td
                    key={day}
                    rowSpan={span}
                    className="border-b border-l border-border px-2 py-1 align-top"
                  >
                    <div className="group flex h-full min-h-10 flex-col gap-0.5 rounded-xs border border-accent/30 bg-accent/10 px-2 py-1.5">
                      <span className="font-medium text-fg">
                        {subjectMap.get(block.subject_id)?.name ?? t("unknownSubject")}
                      </span>
                      <span className="text-[12px] text-fg-muted">{title}</span>
                      {canManage && (
                        <div className="mt-1 flex items-center gap-1">
                          <BlockAction
                            label={t("copyBlock")}
                            icon={<Copy className="size-3.5" aria-hidden="true" />}
                            onClick={() => {
                              onCopy(block);
                            }}
                          />
                          <BlockAction
                            label={t("editBlock")}
                            icon={<Pencil className="size-3.5" aria-hidden="true" />}
                            onClick={() => {
                              onEdit(block);
                            }}
                          />
                          <BlockAction
                            label={t("deleteBlock")}
                            danger
                            icon={<Trash2 className="size-3.5" aria-hidden="true" />}
                            onClick={() => {
                              onDelete(block);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
