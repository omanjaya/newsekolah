"use client";

import { Button, PageHeader } from "@newsekolah/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryNames } from "../../reference/directory-names";
import { CounselingWorkspaceNav } from "../../student-services/components/service-workspace-nav";

import { StudentRiskPanel } from "./student-risk-panel";

export interface StudentRiskDetailViewProps {
  studentId: string;
}

/**
 * One student's signals and the reasons behind the level, so a homeroom
 * teacher or counselor can see exactly what to bring up, not just a
 * label. The body is `StudentRiskPanel`, shared with the student profile.
 */
export function StudentRiskDetailView({ studentId }: StudentRiskDetailViewProps): ReactElement {
  const t = useTranslations("app.analytics.detail");
  const workspace = useTranslations("app.serviceWorkspace");
  const canCounsel = useCan("manage_counseling");
  const router = useRouter();

  const studentMap = useDirectoryNames([studentId]);
  const studentName = studentMap.get(studentId)?.name ?? t("unknownStudent");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => {
          router.back();
        }}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("back")}
      </Button>
      <CounselingWorkspaceNav />
      <PageHeader
        eyebrow={t("eyebrow")}
        title={studentName}
        actions={
          canCounsel && (
            <Button asChild size="sm">
              <Link href={`/discipline/counseling?studentId=${encodeURIComponent(studentId)}`}>
                {workspace("followUpCounseling")}
              </Link>
            </Button>
          )
        }
      />
      <StudentRiskPanel studentId={studentId} />
    </div>
  );
}
