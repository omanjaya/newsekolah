"use client";

import { Button, EmptyState, Field, Select, SkeletonDetail, domainIcons } from "@newsekolah/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useSupervisionCyclesQuery } from "../api";

import { SupervisionWorkspaceNav } from "./supervision-workspace-nav";
import { TeacherSupervisionReportView } from "./teacher-supervision-report-view";

/** The signed-in teacher's own supervision report, one cycle at a time. */
export function MySupervisionReportView(): ReactElement {
  const t = useTranslations("app.supervision.myReport");
  const { me } = useSession();
  const canManage = useCan("manage_supervision");
  const router = useRouter();
  const cycles = useSupervisionCyclesQuery();
  // The personal report only exists for teaching staff; the workspace nav does not
  // offer it to anyone else, so an admin who lands here by URL goes to the cycles.
  const notATeacher = me !== undefined && me.profile_kind !== "teacher";
  useEffect(() => {
    if (notATeacher) router.replace("/supervision/cycles");
  }, [notATeacher, router]);

  const [selectedCycleId, setSelectedCycleId] = useUrlState(
    "cycle",
    (cycles.data?.data ?? []).map((cycle) => cycle.id),
    "",
  );
  const cycleId = selectedCycleId || (cycles.data?.data[0]?.id ?? "");
  const cycleOptions = (cycles.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  let content: ReactElement | null;
  if (notATeacher || cycles.isLoading) {
    content = <SkeletonDetail />;
  } else if (cycles.isError) {
    content = <QueryError retry={() => cycles.refetch()} error={cycles.error} />;
  } else if (cycleId === "") {
    // Whoever can run supervision (the principal) is the one who creates a
    // cycle, so they are pointed at the cycles instead of told to wait.
    content = (
      <EmptyState
        icon={<domainIcons.supervision />}
        title={t("noCyclesTitle")}
        description={canManage ? t("noCyclesManagerBody") : t("noCyclesBody")}
        action={
          canManage ? (
            <Button asChild variant="secondary">
              <Link href="/supervision/cycles">{t("openCycles")}</Link>
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    content = me ? (
      <TeacherSupervisionReportView
        cycleId={cycleId}
        teacherId={me.id}
        hideHeader
        toolbar={
          <Field label={t("cycle")} className="sm:w-72">
            <Select
              options={cycleOptions}
              value={cycleId}
              onValueChange={setSelectedCycleId}
              placeholder={t("cyclePlaceholder")}
            />
          </Field>
        }
      />
    ) : null;
  }

  return (
    <AppPage nav={<SupervisionWorkspaceNav cycleId={cycleId || undefined} />}>{content}</AppPage>
  );
}
