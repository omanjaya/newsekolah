"use client";

import { Button, Card, CardHeader, CardTitle, RowActionsMenu, cn } from "@newsekolah/ui";
import { AlertTriangle, Copy, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import type { ReactElement } from "react";

import type { ScheduleBlock } from "../api";
import { blockCrossesBreak } from "../break-warning";
import { clockLabel } from "../clock-label";
import { periodSpanLabel } from "../period-span";
import { SUBJECT_TONE_CLASSES, subjectTone } from "../subject-tone";
import { useBlockLock } from "../use-block-lock";

import { LessonSubstitutionAction } from "./lesson-substitution-action";
import { lockableBlockActions } from "./lockable-block-actions";

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
  const lockOf = useBlockLock();
  const router = useRouter();
  const lessons = lessonPeriods.filter((period) => !period.is_break);
  const periodBySeq = new Map(lessonPeriods.map((period) => [period.sequence, period]));

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

              const endPeriod = periodBySeq.get(block.end_seq) ?? period;
              return (
                <li
                  key={period.id}
                  className={cn(
                    "flex items-start gap-3 rounded-md px-3 py-2.5",
                    SUBJECT_TONE_CLASSES[subjectTone(block.subject_id)],
                  )}
                >
                  {/* A block may span several periods: like the week agenda,
                      it runs from the first period's start to the last's end. */}
                  <span className="flex w-12 shrink-0 flex-col pt-0.5 text-label tabular-nums">
                    {time}
                    <span className="text-caption font-normal opacity-80">
                      {clockLabel(endPeriod.ends_at, locale)}
                    </span>
                  </span>
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
                      {periodSpanLabel(period, endPeriod)}
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
                        ...lockableBlockActions(block, lockOf(block), t, {
                          onEdit,
                          onDelete,
                          onOpen: (href) => {
                            router.push(href);
                          },
                        }),
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
