"use client";

import { Badge, Button, Card, Progress, Skeleton } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useGradebookQuery } from "../api";
import { gradebookFillPercentage } from "../lib/gradebook-stats";

/**
 * One teaching assignment on the entry page's bento grid
 * (docs/07-ui-ux.md): class and subject as the title, how much of the
 * grid is already filled as a thin progress bar, the publish badge, and
 * the primary "Buka gradebook" action -- which just moves the page's own
 * class/subject pickers to this assignment (`onOpen`), the same sheet
 * already rendered below rather than a separate route. Fetches its own
 * gradebook sheet (dedup'd by TanStack Query against whichever assignment
 * is currently open, so opening the one already active costs nothing
 * extra) since no lighter "my assignments with stats" endpoint exists yet.
 */
export function GradingAssignmentCard({
  classId,
  subjectId,
  termId,
  className,
  subjectName,
  active,
  onOpen,
}: {
  classId: string;
  subjectId: string;
  termId?: string;
  className: string;
  subjectName: string;
  active: boolean;
  onOpen: () => void;
}): ReactElement {
  const t = useTranslations("app.grading");
  const { data: sheet, isLoading } = useGradebookQuery({ classId, subjectId, termId });
  const fillPercent = sheet ? gradebookFillPercentage(sheet.students, sheet.components.length) : 0;

  return (
    <Card
      data-testid={`grading-assignment-card-${classId}-${subjectId}`}
      className={
        active
          ? "flex h-full flex-col gap-3 border-accent p-4 ring-1 ring-accent"
          : "flex h-full flex-col gap-3 p-4"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[15px] font-medium text-fg">
          {className} <span className="text-fg-muted">&middot;</span> {subjectName}
        </p>
        {!isLoading && sheet && (
          <Badge variant={sheet.is_published ? "accent" : "neutral"}>
            {sheet.is_published ? t("sheet.publishedBadge") : t("sheet.draftBadge")}
          </Badge>
        )}
      </div>

      {isLoading || !sheet ? (
        <Skeleton className="h-10 w-full" aria-busy="true" />
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[12px] text-fg-muted">
            <span>{t("entryTiles.filled")}</span>
            <span className="font-medium text-fg tabular-nums">{fillPercent}%</span>
          </div>
          <Progress value={fillPercent} />
          <p className="text-[12px] text-fg-muted">
            {t("assignmentCard.studentCount", { count: sheet.students.length })}
          </p>
        </div>
      )}

      <Button
        size="sm"
        variant={active ? "secondary" : "primary"}
        className="mt-auto"
        onClick={onOpen}
      >
        {t("assignmentCard.open")}
      </Button>
    </Card>
  );
}
