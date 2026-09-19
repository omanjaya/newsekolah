"use client";

import { cn } from "@newsekolah/ui";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { ReactElement } from "react";

import type { ScheduleBlock } from "../api";

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
 * The day view on a phone: one card per class, each listing that class's
 * lessons for the chosen day. The wide version puts classes in columns,
 * which a phone cannot hold, and the week agenda cannot stand in for it
 * because in this mode the rows belong to different classes and nothing
 * on screen would say which.
 */
export function ScheduleMobileDayList({
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
}: {
  classes: Named[];
  lessonPeriods: Period[];
  /** Lesson blocks keyed by `${classId}:${sequence}`, one entry per period
   * the block spans, so a row looks itself up in O(1). */
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
}): ReactElement {
  const lessons = lessonPeriods.filter((period) => !period.is_break);

  return (
    <div className="flex flex-col gap-3 md:hidden">
      {classes.map((classItem) => (
        <section
          key={classItem.id}
          className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-3"
        >
          <h3 className="text-[14px] font-medium text-fg">{classItem.name}</h3>
          <ul className="flex flex-col gap-2">
            {lessons.map((period) => {
              const block = blocks.get(`${classItem.id}:${period.sequence}`);
              if (block && block.start_seq !== period.sequence) return null;

              return (
                <li
                  key={period.id}
                  className={cn(
                    "flex flex-col gap-1 rounded-xs px-3 py-2",
                    block ? "border border-accent/30 bg-accent/10" : "border border-border",
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-[13px] text-fg-muted">{period.name}</span>
                    <span className="text-[12px] text-fg-muted">
                      {period.starts_at.slice(0, 5)}-{period.ends_at.slice(0, 5)}
                    </span>
                  </div>
                  {block ? (
                    <>
                      <span className="font-medium text-fg">
                        {subjectMap.get(block.subject_id)?.name ?? t("unknownSubject")}
                      </span>
                      <span className="text-[12px] text-fg-muted">
                        {teacherMap.get(block.teacher_user_id)?.name ?? t("unknownTeacher")}
                      </span>
                      {canManage && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <DayAction
                            label={t("copyBlock")}
                            icon={<Copy className="size-3.5" aria-hidden="true" />}
                            onClick={() => {
                              onCopy(block);
                            }}
                          />
                          <DayAction
                            label={t("editBlock")}
                            icon={<Pencil className="size-3.5" aria-hidden="true" />}
                            onClick={() => {
                              onEdit(block);
                            }}
                          />
                          <DayAction
                            label={t("deleteBlock")}
                            danger
                            icon={<Trash2 className="size-3.5" aria-hidden="true" />}
                            onClick={() => {
                              onDelete(block);
                            }}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          if (copied) {
                            onPaste(classItem.id, period.sequence);
                            return;
                          }
                          onAdd(classItem.id, period.sequence);
                        }}
                        className="mt-1 flex min-h-11 w-full items-center justify-center gap-1 rounded-xs border border-dashed border-border text-[12px] text-fg-muted hover:bg-bg"
                      >
                        {copied ? (
                          <Copy className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Plus className="size-3.5" aria-hidden="true" />
                        )}
                        {copied ? t("pasteHere") : t("addHere")}
                      </button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** A labelled action on a day-list row, thumb-sized because it is tapped. */
function DayAction({
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
