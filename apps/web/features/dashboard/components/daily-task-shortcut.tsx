import { Button, domainIcons } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

export type DailyTask = "attendance" | "circulation" | "duty" | "grades" | "schoolData";

export function selectDailyTask({
  canManageAttendance,
  canManageCirculation,
  canIssueScanTokens,
  canViewAcademicData,
  canViewOwnGrades,
  profileKind,
}: {
  canManageAttendance: boolean;
  canManageCirculation: boolean;
  canIssueScanTokens: boolean;
  canViewAcademicData: boolean;
  canViewOwnGrades: boolean;
  profileKind?: "staff" | "student" | "teacher";
}): DailyTask | null {
  if (canManageAttendance) return "attendance";
  if (canManageCirculation) return "circulation";
  if (canIssueScanTokens) return "duty";
  if (profileKind === "student" && canViewOwnGrades) return "grades";
  if (profileKind === "staff" && canViewAcademicData) return "schoolData";
  return null;
}

const TASKS: Record<DailyTask, { href: string; icon: keyof typeof domainIcons }> = {
  attendance: { href: "/attendance", icon: "attendance" },
  circulation: { href: "/library/desk", icon: "library" },
  duty: { href: "/duty", icon: "qr" },
  grades: { href: "/my-grades", icon: "grades" },
  schoolData: { href: "/school/classes", icon: "users" },
};

export function DailyTaskShortcut({ task }: { task: DailyTask }): ReactElement {
  const t = useTranslations("app.dashboardPersona");
  const { href, icon } = TASKS[task];
  const Icon = domainIcons[icon];
  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-fg" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h2 className="text-[16px] font-medium text-fg">{t(`tasks.${task}.title`)}</h2>
          <p className="text-[13px] text-fg-muted">{t(`tasks.${task}.description`)}</p>
        </div>
      </div>
      <div>
        <Button asChild>
          <Link href={href}>{t(`tasks.${task}.action`)}</Link>
        </Button>
      </div>
    </section>
  );
}
