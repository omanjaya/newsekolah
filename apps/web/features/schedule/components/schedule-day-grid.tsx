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
 * One day, every class side by side. This is the view someone building a
 * timetable actually works in: a clash is two lessons on the same row,
 * and a hole is an empty cell, both visible without changing anything.
 * The week-for-one-class view answers a different question, so the two
 * live alongside each other rather than one replacing the other.
 */
export function ScheduleDayGrid({
  classes,
  lessonPeriods,
  blockAt,
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
}: {
  classes: Named[];
  lessonPeriods: Period[];
  blockAt: (classId: string, seq: number) => ScheduleBlock | undefined;
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
}): ReactElement {
  return (
    <div className="overflow-x-auto rounded-sm border border-border bg-surface">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead>
          <tr className="bg-bg text-left text-fg-muted">
            <th scope="col" className="w-28 border-b border-border px-3 py-2 font-medium">
              {t("periodColumn")}
            </th>
            {classes.map((classItem) => (
              <th
                key={classItem.id}
                scope="col"
                className="border-b border-l border-border px-3 py-2 font-medium"
              >
                {classItem.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lessonPeriods.map((period) => (
            <tr key={period.id} className={cn(period.is_break && "bg-bg/60")}>
              <th scope="row" className="border-b border-border px-3 py-2 text-left font-normal">
                <div className="flex flex-col">
                  <span className="text-fg">{period.name}</span>
                  <span className="text-[12px] text-fg-muted">
                    {period.starts_at.slice(0, 5)}-{period.ends_at.slice(0, 5)}
                  </span>
                </div>
              </th>
              {classes.map((classItem) => {
                const block = blockAt(classItem.id, period.sequence);
                if (block && block.start_seq !== period.sequence) return null;
                if (period.is_break) {
                  return (
                    <td
                      key={classItem.id}
                      className="border-b border-l border-border px-3 py-2 text-fg-muted"
                    />
                  );
                }
                if (!block) {
                  return (
                    <td
                      key={classItem.id}
                      className="border-b border-l border-border px-2 py-1 align-top"
                    >
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            if (copied) {
                              onPaste(classItem.id, period.sequence);
                              return;
                            }
                            onAdd(classItem.id, period.sequence);
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
                return (
                  <td
                    key={classItem.id}
                    rowSpan={block.end_seq - block.start_seq + 1}
                    className="border-b border-l border-border px-2 py-1 align-top"
                  >
                    <div className="flex h-full min-h-10 flex-col gap-0.5 rounded-xs border border-accent/30 bg-accent/10 px-2 py-1.5">
                      <span className="font-medium text-fg">
                        {subjectMap.get(block.subject_id)?.name ?? t("unknownSubject")}
                      </span>
                      <span className="text-[12px] text-fg-muted">
                        {teacherMap.get(block.teacher_user_id)?.name ?? t("unknownTeacher")}
                      </span>
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
