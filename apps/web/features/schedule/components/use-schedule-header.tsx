"use client";

import { Button, type PageHeaderAction, type PageHeaderProps } from "@newsekolah/ui";
import { FileSpreadsheet, Plus, Repeat, ScanLine } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";
import { useSubstitutionsQuery } from "../../substitutions/api";

import { ScheduleCurrentPeriodPill } from "./schedule-current-period-pill";

/**
 * The timetable page's header, per reader: the one main action (add a
 * lesson for a timetable manager, scan into class for a student), the
 * bulk operations and any substitution requests waiting on this teacher as
 * secondary actions. Also the page's context (the student's class, the
 * school year and the period in session now), which the page shows in its
 * toolbar rather than as the header's description: the calendar and the
 * substitutions tabs have none, so a description would move the area's
 * tab strip between tabs.
 */
export function useScheduleHeader({
  canManage,
  isStudent,
  className,
  yearLabel,
  onAdd,
}: {
  canManage: boolean;
  isStudent: boolean;
  /** The student's class, named in the context line. */
  className?: string;
  yearLabel: string;
  onAdd: () => void;
}): {
  primaryAction: ReactNode;
  /** The main action as a round button beside the title on a phone. */
  primaryActionCompact: PageHeaderProps["primaryActionCompact"];
  secondaryActions: PageHeaderAction[];
  /** The class, year and current period, for the page's toolbar. */
  context: ReactNode;
} {
  const t = useTranslations("app.schedule");
  const tWorkspace = useTranslations("app.academic.workspace");
  const { me } = useSession();
  const access = navAccessFromMe(me);
  // Requests waiting on this teacher, fetched only for readers who may open them.
  const incoming = useSubstitutionsQuery("incoming", canOpenPath("/substitutions", access));
  const pending = incoming.data?.data.filter((request) => request.status === "pending").length ?? 0;

  const secondaryActions: PageHeaderAction[] = [
    ...(canManage
      ? [{ label: t("bulk.navLink"), icon: <FileSpreadsheet />, href: "/schedule/bulk" }]
      : []),
    ...(pending > 0
      ? [
          {
            label: tWorkspace("pendingSubstitutions", { count: pending }),
            icon: <Repeat />,
            href: "/substitutions",
          },
        ]
      : []),
  ];

  const canScanEntry = !canManage && isStudent && canOpenPath("/classroom-entry", access);
  const primaryAction = canManage ? (
    <Button icon={<Plus />} onClick={onAdd}>
      {t("addBlock")}
    </Button>
  ) : canScanEntry ? (
    <Button asChild icon={<ScanLine />}>
      <Link href="/classroom-entry">{tWorkspace("scanEntry")}</Link>
    </Button>
  ) : undefined;
  // On a phone either action is an icon button on the title's line (its
  // label is the name and the tooltip). A full-width row under the title
  // would push the area's tab strip down on this tab only: the calendar
  // and the substitutions tabs have no such action.
  const primaryActionCompact = canManage
    ? { icon: <Plus />, label: t("addBlock"), onSelect: onAdd }
    : canScanEntry
      ? { icon: <ScanLine />, label: tWorkspace("scanEntry"), href: "/classroom-entry" }
      : undefined;

  const context = (
    <p
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-fg-muted sm:ml-auto"
      data-testid="schedule-context"
    >
      <span>{[isStudent ? className : undefined, yearLabel].filter(Boolean).join(" · ")}</span>
      <ScheduleCurrentPeriodPill />
    </p>
  );

  return { primaryAction, primaryActionCompact, secondaryActions, context };
}
