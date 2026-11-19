"use client";

import {
  Avatar,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  domainIcons,
  type BreadcrumbItem,
} from "@newsekolah/ui";
import { MessagesSquare, Pencil, Printer } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { RecordNotFoundPage } from "../../../components/record-not-found";
import { isNotFoundError } from "../../../lib/api/not-found";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useModuleEnabled } from "../../../lib/modules/use-module-enabled";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useStudentRiskQuery } from "../../analytics/api";
import { useOpenStudentDisciplineReport } from "../../discipline/components/use-open-student-discipline-report";
import { useMentorStudentSnapshotQuery } from "../../mentoring/api";
import { useClassesQuery } from "../../reference/api";
import { useDirectoryLookup } from "../../reference/directory-names";
import { personRecordStatus } from "../../reference/person-record";
import { useUserQuery } from "../../school/api";
import { UserForm } from "../../school/components/user-form";
import { visibleStudentProfileTabs, type StudentProfileTab } from "../lib/profile-tabs";

import { StudentOverviewTab } from "./student-overview";
import {
  StudentAttendanceTab,
  StudentCounselingTab,
  StudentDisciplineTab,
  StudentGradesTab,
  StudentGuardiansTab,
  StudentLibraryTab,
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
 * One student's profile (docs/07-ui-ux.md, "Detail"): a trail back to the
 * class, the student's name and photo with the actions on the right, then
 * tabs kept in the URL. Each tab is the panel its own feature already
 * ships, shown only when the reader holds the permission of its endpoint.
 */
export function StudentProfileView({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.studentProfile");
  const tClasses = useTranslations("app.school.classes");
  const canViewUsers = useCan("view_users");
  const canEditUsers = useCan("edit_users");
  const mentoringOn = useModuleEnabled("mentoring");
  const disciplineOn = useModuleEnabled("discipline");
  const canSnapshot = useCan("view_mentoring") && mentoringOn;
  const canRisk = useCan("view_early_warning");
  const canDiscipline = useCan("view_discipline") && disciplineOn;
  const canCounsel = useCan("manage_counseling") && disciplineOn;
  const workspace = useTranslations("app.serviceWorkspace");
  const tDiscipline = useTranslations("app.discipline.studentDetail");
  const report = useOpenStudentDisciplineReport();
  const [editing, setEditing] = useState(false);

  const { me } = useSession();
  const granted = me?.permissions;
  const disabledModules = me?.disabled_modules;
  const tabs = useMemo(
    () =>
      visibleStudentProfileTabs(
        (permission) => granted?.includes(permission) ?? false,
        disabledModules ?? [],
      ),
    [granted, disabledModules],
  );
  const [tab, setTab] = useUrlState<string>("tab", tabs, tabs[0] ?? "overview");
  const canOpenClasses = useMemo(
    () => (me ? canOpenPath("/school/classes", navAccessFromMe(me)) : false),
    [me],
  );

  const lookup = useDirectoryLookup([studentId]);
  const studentMap = lookup.names;
  const user = useUserQuery(canViewUsers ? studentId : "");
  const snapshot = useMentorStudentSnapshotQuery(studentId, canSnapshot);
  const risk = useStudentRiskQuery(studentId, canRisk);
  const classes = useClassesQuery(canOpenClasses);

  const name = formatDisplayName(
    user.data?.name ?? studentMap.get(studentId)?.name ?? t("unknownStudent"),
  );
  const nis = user.data?.profile?.nis;
  const classId = risk.data?.class_id;
  const className =
    (classId ? classes.data?.data.find((c) => c.id === classId)?.name : undefined) ??
    snapshot.data?.class_name;

  const breadcrumb: BreadcrumbItem[] = [
    ...(canOpenClasses ? [{ label: tClasses("title"), href: "/school/classes" }] : []),
    ...(className
      ? [
          {
            label: className,
            href:
              canOpenClasses && classId
                ? `/school/classes?class=${encodeURIComponent(classId)}`
                : undefined,
          },
        ]
      : []),
    { label: name },
  ];

  // A student the school does not have (an unknown or malformed id in the
  // address) is not found: no tabs whose every panel would fail to load.
  if (
    personRecordStatus(lookup, studentId, "student") === "missing" ||
    (!user.data && isNotFoundError(user.error))
  ) {
    return (
      <RecordNotFoundPage
        title={t("notFoundTitle")}
        backHref={canOpenClasses ? "/school/classes" : "/dashboard"}
        backLabel={canOpenClasses ? t("backToClasses") : t("backHome")}
      />
    );
  }

  if (tabs.length === 0) {
    return (
      <AppPage title={t("eyebrow")} breadcrumb={false}>
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("noAccessTitle")}
          description={t("noAccessBody")}
        />
      </AppPage>
    );
  }

  return (
    <AppPage
      documentTitle={name}
      breadcrumb={breadcrumb.length > 1 ? breadcrumb : false}
      eyebrow={breadcrumb.length > 1 ? undefined : t("eyebrow")}
      leading={<Avatar name={name} src={user.data?.avatar_url} size={64} decorative />}
      title={<span className="break-words">{name}</span>}
      description={
        [className ? t("className", { name: className }) : null, nis ? t("nis", { nis }) : null]
          .filter(Boolean)
          .join(" · ") || undefined
      }
      primaryAction={
        canCounsel ? (
          <Button asChild icon={<MessagesSquare />}>
            <Link href={`/discipline/counseling?studentId=${encodeURIComponent(studentId)}`}>
              {workspace("followUpCounseling")}
            </Link>
          </Button>
        ) : undefined
      }
      // The printable report and "Ubah data" are the header's further
      // actions: buttons of one size from 640px, one menu on a phone.
      secondaryActions={[
        ...(canDiscipline
          ? [
              {
                label: tDiscipline("printReport"),
                icon: <Printer />,
                disabled: report.pending,
                onSelect: () => {
                  report.open(studentId);
                },
              },
            ]
          : []),
        ...(canEditUsers && user.data
          ? [
              {
                label: t("editData"),
                icon: <Pencil />,
                onSelect: () => {
                  setEditing(true);
                },
              },
            ]
          : []),
      ]}
    >
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-6">
        <TabsList variant="underline" aria-label={t("tabsLabel")}>
          {tabs.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(`tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((id) => {
          const Panel = TAB_PANELS[id];
          return (
            // The Tabs gap already spaces the panel from the strip.
            <TabsContent key={id} value={id} className="pt-0">
              <Panel studentId={studentId} />
            </TabsContent>
          );
        })}
      </Tabs>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={t("editData")} size="lg">
          {editing && user.data && (
            <UserForm
              initial={user.data}
              onDone={() => {
                setEditing(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}
