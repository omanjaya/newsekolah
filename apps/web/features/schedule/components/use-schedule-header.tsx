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
 * secondary actions, and one description line with the student's class,
 * the school year and the period in session now.
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
  /** The student's class, named in the description. */
  className?: string;
  yearLabel: string;
  onAdd: () => void;
}): {
  primaryAction: ReactNode;
  /** The manager's add action as a round button beside the title on a phone. */
  primaryActionCompact: PageHeaderProps["primaryActionCompact"];
  secondaryActions: PageHeaderAction[];
  description: ReactNode;
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

  const primaryAction = canManage ? (
    <Button icon={<Plus />} onClick={onAdd}>
      {t("addBlock")}
    </Button>
  ) : isStudent && canOpenPath("/classroom-entry", access) ? (
    <Button asChild icon={<ScanLine />}>
      <Link href="/classroom-entry">{tWorkspace("scanEntry")}</Link>
    </Button>
  ) : undefined;
  // The student's scan action keeps its label: it leaves the timetable.
  const primaryActionCompact = canManage
    ? { icon: <Plus />, label: t("addBlock"), onSelect: onAdd }
    : undefined;

  const description = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{[isStudent ? className : undefined, yearLabel].filter(Boolean).join(" · ")}</span>
      <ScheduleCurrentPeriodPill />
    </span>
  );

  return { primaryAction, primaryActionCompact, secondaryActions, description };
}
