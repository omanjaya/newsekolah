"use client";

import { ApiError } from "@newsekolah/api-client";
import { Badge, Button, Card, Skeleton, useToast } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  useDisciplinePolicyQuery,
  useIssueWarningLetterMutation,
  useSPCandidatesQuery,
} from "../../discipline/api";
import { dueLevels } from "../../discipline/lib/sp-due-levels";
import { StudentLink } from "../../students/components/student-link";
import { studentProfileHref } from "../../students/href";
import { INBOX_SP_FILTERS } from "../use-action-inbox-count";

/** Students whose points reached a warning-letter level not yet issued, with the same one-click issue as the at-risk tab. */
export function WarningLetterCandidatesSection(): ReactElement {
  const t = useTranslations("app.inbox.warningLetters");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const policy = useDisciplinePolicyQuery();
  const candidates = useSPCandidatesQuery(INBOX_SP_FILTERS);
  const issue = useIssueWarningLetterMutation();
  const levels = policy.data?.levels ?? [];
  const rows = (candidates.data?.data ?? []).flatMap((candidate) => {
    const [next, ...rest] = dueLevels(candidate, levels);
    return next ? [{ candidate, due: [next, ...rest] as const, next }] : [];
  });

  if (candidates.isLoading || policy.isLoading) {
    return <Skeleton className="h-24 w-full" aria-busy="true" />;
  }
  if (candidates.isError || policy.isError) {
    return (
      <QueryError
        retry={() => {
          void candidates.refetch();
          void policy.refetch();
        }}
      />
    );
  }
  if (rows.length === 0) {
    return <p className="py-4 text-center text-sm text-fg-muted">{t("empty")}</p>;
  }

  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {rows.map(({ candidate, due, next }) => {
        return (
          <li key={candidate.student_user_id} className="flex h-full flex-col">
            <Card className="flex h-full flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[14px] font-medium text-fg">
                    <StudentLink studentId={candidate.student_user_id} tab="discipline">
                      {candidate.student_name}
                    </StudentLink>
                  </span>
                  <span className="text-[13px] text-fg-muted">
                    {candidate.nis} · {candidate.class_name}
                  </span>
                  <span className="text-[13px] text-fg">
                    {t("points", { count: candidate.total_points })}
                  </span>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {due.map((level) => (
                    <Badge key={level.level} variant="accent">
                      {level.label}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-end gap-1.5">
                <Button size="sm" variant="secondary" asChild>
                  <Link href={studentProfileHref(candidate.student_user_id, "discipline")}>
                    {t("open")}
                  </Link>
                </Button>
                <Button
                  size="sm"
                  loading={issue.isPending}
                  onClick={() => {
                    issue.mutate(
                      { student_user_id: candidate.student_user_id, level: next.level },
                      {
                        onSuccess: () => {
                          toast.success(t("issued", { level: next.label }));
                        },
                        onError: (error) => {
                          toast.error(
                            error instanceof ApiError
                              ? apiErrorMessage(error.code)
                              : apiErrorMessage("UNKNOWN"),
                          );
                        },
                      },
                    );
                  }}
                >
                  {t("issue", { level: next.label })}
                </Button>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
