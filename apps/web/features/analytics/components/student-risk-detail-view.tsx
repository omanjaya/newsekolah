"use client";

import { Avatar, Button, TextLink } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { useModuleEnabled } from "../../../lib/modules/use-module-enabled";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryNames } from "../../reference/directory-names";
import { studentProfileHref } from "../../students/href";

import { StudentRiskPanel } from "./student-risk-panel";

export interface StudentRiskDetailViewProps {
  studentId: string;
}

/**
 * One student's signals and the reasons behind the level, so a homeroom
 * teacher or counselor can see exactly what to bring up, not just a
 * label. The body is `StudentRiskPanel`, shared with the student profile.
 * The trail back to the list comes from the page template.
 */
export function StudentRiskDetailView({ studentId }: StudentRiskDetailViewProps): ReactElement {
  const t = useTranslations("app.analytics.detail");
  const workspace = useTranslations("app.serviceWorkspace");
  // Counseling is part of discipline: the follow-up goes away with it.
  const disciplineOn = useModuleEnabled("discipline");
  const canCounsel = useCan("manage_counseling") && disciplineOn;

  const studentMap = useDirectoryNames([studentId]);
  const studentName = studentMap.get(studentId)?.name ?? t("unknownStudent");

  return (
    <AppPage
      leading={<Avatar name={studentName} size={48} decorative />}
      title={studentName}
      description={<TextLink href={studentProfileHref(studentId)}>{t("openProfile")}</TextLink>}
      primaryAction={
        canCounsel ? (
          <Button asChild>
            <Link href={`/discipline/counseling?studentId=${encodeURIComponent(studentId)}`}>
              {workspace("followUpCounseling")}
            </Link>
          </Button>
        ) : undefined
      }
    >
      <StudentRiskPanel studentId={studentId} />
    </AppPage>
  );
}
