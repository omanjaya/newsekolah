"use client";

import { PageHeader, Select } from "@newsekolah/ui";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";

import { ExitPermitsView } from "./exit-permits-view";
import { LateArrivalsView } from "./late-arrivals-view";
import { LeaveRequestsView } from "./leave-requests-view";
import { PermitUnifiedQueue } from "./permit-unified-queue";

export function PermitsWorkspaceView({
  initialType = "allQueue",
}: {
  initialType?: string;
}): ReactElement {
  const t = useTranslations("app.serviceWorkspace");
  const { me } = useSession();
  const searchParams = useSearchParams();
  const canSubmit = useCan("submit_leave_requests");
  const canReviewLeave = useCan("review_leave_requests");
  const canIssue = useCan("issue_leave_letters");
  const canApproveExit = useCan("issue_scan_tokens");
  const canGate = useCan("scan_exit_permits");
  const canReviewLate = me?.profile_kind === "teacher" || me?.profile_kind === "staff";
  const canQueue = canReviewLeave || canApproveExit || canGate || canReviewLate;
  const options = [
    ...(canQueue ? [{ value: "allQueue", label: t("allQueue") }] : []),
    ...(canSubmit || canReviewLeave || canIssue ? [{ value: "leave", label: t("leave") }] : []),
    ...(canSubmit || canApproveExit || canGate ? [{ value: "exit", label: t("exit") }] : []),
    ...(canSubmit || canReviewLate ? [{ value: "late", label: t("late") }] : []),
  ];
  // Preserve legacy bookmarks to a leave-specific queue or history tab.
  const preferredType =
    initialType === "allQueue" && searchParams.has("tab") ? "leave" : initialType;
  const defaultType = options.some((option) => option.value === preferredType)
    ? preferredType
    : (options[0]?.value ?? "none");
  const [type, setType] = useUrlState<string>(
    "type",
    options.map((option) => option.value),
    defaultType,
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={t("permits")} />
      {options.length > 0 ? (
        <>
          <label className="flex max-w-sm flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("permitKind")}</span>
            <Select value={type} onValueChange={setType} options={options} />
          </label>
          {type === "allQueue" && <PermitUnifiedQueue />}
          {type === "leave" && <LeaveRequestsView embedded />}
          {type === "exit" && <ExitPermitsView embedded />}
          {type === "late" && <LateArrivalsView embedded />}
        </>
      ) : (
        <p className="text-sm text-fg-muted">{t("noAccess")}</p>
      )}
    </div>
  );
}
