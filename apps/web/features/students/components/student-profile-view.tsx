"use client";

import {
  Avatar,
  Button,
  EmptyState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  domainIcons,
} from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useMemo } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { StudentDisciplineReportButton } from "../../discipline/components/student-discipline-view";
import { useMentorStudentSnapshotQuery } from "../../mentoring/api";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import { useUserQuery } from "../../school/api";
import { visibleStudentProfileTabs, type StudentProfileTab } from "../lib/profile-tabs";

import {
  StudentAttendanceTab,
  StudentCounselingTab,
  StudentDisciplineTab,
  StudentGradesTab,
  StudentGuardiansTab,
  StudentLibraryTab,
  StudentOverviewTab,
  StudentPermitsTab,
} from "./student-tab-panels";

const TAB_PANELS: Record<StudentProfileTab, (props: { studentId: string }) => ReactElement> = {
  overview: StudentOverviewTab,
  attendance: StudentAttendanceTab,
  grades: StudentGradesTab,
  permits: StudentPermitsTab,
  discipline: StudentDisciplineTab,
  counseling: StudentCounselingTab,
  library: StudentLibraryTab,
  guardians: StudentGuardiansTab,
};

/**
 * One student's profile (docs/07-ui-ux.md, "Detail"): identity header with
 * the primary actions on the right, then tabs kept in the URL. Each tab is
 * the panel its own feature already ships, shown only when the reader
 * holds the permission of its endpoint.
 */
export function StudentProfileView({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.studentProfile");
  const canViewUsers = useCan("view_users");
  const canSnapshot = useCan("view_mentoring");
  const canDiscipline = useCan("view_discipline");
  const canCounsel = useCan("manage_counseling");
  const workspace = useTranslations("app.serviceWorkspace");

  const { me } = useSession();
  const granted = me?.permissions;
  const tabs = useMemo(
    () => visibleStudentProfileTabs((permission) => granted?.includes(permission) ?? false),
    [granted],
  );
  const [tab, setTab] = useUrlState<string>("tab", tabs, tabs[0] ?? "overview");

  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const user = useUserQuery(canViewUsers ? studentId : "");
  const snapshot = useMentorStudentSnapshotQuery(studentId, canSnapshot);

  const name = formatDisplayName(
    user.data?.name ?? studentMap.get(studentId)?.name ?? t("unknownStudent"),
  );
  const nis = user.data?.profile?.nis;
  const className = snapshot.data?.class_name;

  if (tabs.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("noAccessTitle")}
          description={t("noAccessBody")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={name} src={user.data?.avatar_url} className="size-14 text-[18px]" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-[12px] font-medium text-fg-muted">{t("eyebrow")}</p>
            <h1 className="truncate text-[22px] font-semibold text-fg">{name}</h1>
            <p className="text-[13px] text-fg-muted">
              {[
                className ? t("className", { name: className }) : null,
                nis ? t("nis", { nis }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <ProfileActions>
          {canDiscipline && <StudentDisciplineReportButton studentId={studentId} />}
          {canCounsel && (
            <Button asChild size="sm">
              <Link href={`/discipline/counseling?studentId=${encodeURIComponent(studentId)}`}>
                {workspace("followUpCounseling")}
              </Link>
            </Button>
          )}
        </ProfileActions>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label={t("tabsLabel")} className="max-w-full overflow-x-auto">
          {tabs.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(`tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((id) => {
          const Panel = TAB_PANELS[id];
          return (
            <TabsContent key={id} value={id}>
              <Panel studentId={studentId} />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function ProfileActions({ children }: { children: ReactNode }): ReactElement {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
