"use client";

import { Avatar, Button, TextLink } from "@newsekolah/ui";
import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { RecordNotFoundPage } from "../../../components/record-not-found";
import { useModuleEnabled } from "../../../lib/modules/use-module-enabled";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryLookup } from "../../reference/directory-names";
import { personRecordStatus } from "../../reference/person-record";
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

  const lookup = useDirectoryLookup([studentId]);
  const student = lookup.names.get(studentId);
  const studentName = student?.name ?? t("unknownStudent");

  // A student the school does not have (an unknown or malformed id in the
  // address) is not found, not a risk result that failed to load.
  if (personRecordStatus(lookup, studentId) === "missing") {
    return (
      <RecordNotFoundPage
        title={t("notFoundTitle")}
        backHref="/analytics"
        backLabel={t("backToList")}
      />
    );
  }

  return (
    <AppPage
      leading={<Avatar name={studentName} size={48} decorative />}
      title={studentName}
      // The same identity line as the student's discipline record.
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {student?.nis && <span>{t("nis", { nis: student.nis })}</span>}
          <TextLink href={studentProfileHref(studentId)}>{t("openProfile")}</TextLink>
        </span>
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
    >
      <StudentRiskPanel studentId={studentId} />
    </AppPage>
  );
}
