"use client";

import { Button, Card, CardHeader, CardTitle, RowActionsMenu, cn } from "@newsekolah/ui";
import { AlertTriangle, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale } from "next-intl";
import type { ReactElement } from "react";

import type { ScheduleBlock } from "../api";
import { blockCrossesBreak } from "../break-warning";
import { clockLabel } from "../clock-label";
import { SUBJECT_TONE_CLASSES, subjectTone } from "../subject-tone";

import { LessonSubstitutionAction } from "./lesson-substitution-action";

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
  const locale = useLocale();
  const lessons = lessonPeriods.filter((period) => !period.is_break);

  return (
    <div className="flex flex-col gap-4 md:hidden">
      {classes.map((classItem) => (
        <Card key={classItem.id} padding="sm">
          <CardHeader>
            <CardTitle as="h3">{classItem.name}</CardTitle>
          </CardHeader>
          <ul className="flex flex-col gap-2">
            {lessons.map((period) => {
              const block = blocks.get(`${classItem.id}:${period.sequence}`);
              if (block && block.start_seq !== period.sequence) return null;
              const time = clockLabel(period.starts_at, locale);

              if (!block) {
                return (
                  <li
                    key={period.id}
                    className="flex min-h-11 items-center gap-3 rounded-md border border-dashed border-border px-3 py-1.5 text-body-sm text-fg-muted"
                  >
                    <span className="w-12 shrink-0 tabular-nums">{time}</span>
                    <span className="min-w-0 flex-1 truncate">{period.name}</span>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={copied ? <Copy /> : <Plus />}
                        onClick={() => {
                          if (copied) {
                            onPaste(classItem.id, period.sequence);
                            return;
                          }
                          onAdd(classItem.id, period.sequence);
                        }}
                      >
                        {copied ? t("pasteHere") : t("addHere")}
                      </Button>
                    )}
                  </li>
                );
              }

              return (
                <li
                  key={period.id}
                  className={cn(
                    "flex items-start gap-3 rounded-md px-3 py-2.5",
                    SUBJECT_TONE_CLASSES[subjectTone(block.subject_id)],
                  )}
                >
                  <span className="w-12 shrink-0 pt-0.5 text-label tabular-nums">{time}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-label">
                        {subjectMap.get(block.subject_id)?.name ?? t("unknownSubject")}
                      </span>
                      {canManage && blockCrossesBreak(block, lessonPeriods) && (
                        <span
                          role="img"
                          aria-label={t("crossesBreakWarning")}
                          title={t("crossesBreakWarning")}
                          className="inline-flex shrink-0 text-warning"
                        >
                          <AlertTriangle className="size-3.5" aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className="text-body-sm opacity-90">
                      {teacherMap.get(block.teacher_user_id)?.name ?? t("unknownTeacher")} ·{" "}
                      {period.name}
                    </span>
                    <div className="-ml-3 empty:hidden">
                      <LessonSubstitutionAction block={block} />
                    </div>
                  </div>
                  {canManage && (
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
        </Card>
      ))}
    </div>
  );
}
