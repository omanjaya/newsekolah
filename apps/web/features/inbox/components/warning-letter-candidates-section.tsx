"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  List,
  ListRow,
  SkeletonList,
  useToast,
} from "@newsekolah/ui";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type SPCandidate,
  useDisciplinePolicyQuery,
  useIssueWarningLetterMutation,
  useRefreshDiscipline,
  useSPCandidatesQuery,
} from "../../discipline/api";
import { dueLevels } from "../../discipline/lib/sp-due-levels";
import { studentProfileHref } from "../../students/href";
import { INBOX_SP_FILTERS } from "../use-action-inbox-count";

/** The letter the reader asked to issue, held until they confirm it. */
interface PendingIssue {
  candidate: SPCandidate;
  level: number;
  label: string;
}

/**
 * Students whose points reached a warning-letter level not yet issued, as
 * rows that open the student's discipline tab, with the at-risk tab's issue
 * flow as each row's own action: issuing numbers a letter on the student's
 * record, so it is confirmed first, and only the row being issued spins.
 */
export function WarningLetterCandidatesSection(): ReactElement {
  const t = useTranslations("app.inbox.warningLetters");
  // The confirmation is the Kandidat SP tab's own, so the two never drift.
  const tAtRisk = useTranslations("app.discipline.warningLetters.atRisk");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const policy = useDisciplinePolicyQuery();
  const candidates = useSPCandidatesQuery(INBOX_SP_FILTERS);
  const issue = useIssueWarningLetterMutation();
  const refreshDiscipline = useRefreshDiscipline();
  const [pendingIssue, setPendingIssue] = useState<PendingIssue | null>(null);
  const levels = policy.data?.levels ?? [];
  const rows = (candidates.data?.data ?? []).flatMap((candidate) => {
    const [next, ...rest] = dueLevels(candidate, levels);
    return next ? [{ candidate, due: [next, ...rest] as const, next }] : [];
  });

  function confirmIssue() {
    if (!pendingIssue) return;
    const { candidate, level, label } = pendingIssue;
    issue.mutate(
      { student_user_id: candidate.student_user_id, level },
      {
        onSuccess: () => {
          setPendingIssue(null);
          toast.success(t("issued", { level: label }));
        },
        // On failure the dialog stays open so the reader can try again.
        // "Already issued" means the letter exists (another tab or
        // counselor got there first): that is done, not a failure.
        onError: (error) => {
          if (error instanceof ApiError && error.code === "WARNING_LETTER_ALREADY_ISSUED") {
            setPendingIssue(null);
            // The list still offers that level: reload it so the row moves
            // on to the next level, or leaves when none is due.
            void refreshDiscipline();
            toast.info(t("alreadyIssued", { level: label }));
            return;
          }
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  if (candidates.isLoading || policy.isLoading) {
    return <SkeletonList rows={3} />;
  }
  if (candidates.isError || policy.isError) {
    return (
      <QueryError
        retry={() => {
          void candidates.refetch();
          void policy.refetch();
        }}
        error={candidates.error ?? policy.error}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <Card padding="sm">
        <EmptyState variant="compact" icon={<ShieldCheck />} title={t("empty")} />
      </Card>
    );
  }

  return (
    <Card>
      <List>
        {rows.map(({ candidate, due, next }) => (
          <ListRow
            key={candidate.student_user_id}
            href={studentProfileHref(candidate.student_user_id, "discipline")}
            title={candidate.student_name}
            meta={t("meta", {
              nis: candidate.nis,
              className: candidate.class_name,
              points: candidate.total_points,
            })}
            trailing={due.map((level) => (
              <Badge key={level.level} tone="accent" size="sm">
                {level.label}
              </Badge>
            ))}
            action={
              <Button
                size="sm"
                loading={
                  issue.isPending && issue.variables.student_user_id === candidate.student_user_id
                }
                onClick={() => {
                  setPendingIssue({ candidate, level: next.level, label: next.label });
                }}
              >
                {t("issue", { level: next.label })}
              </Button>
            }
          />
        ))}
      </List>
      <ConfirmDialog
        open={pendingIssue !== null}
        onOpenChange={(open) => {
          if (!open) setPendingIssue(null);
        }}
        title={tAtRisk("issueConfirm.title", {
          level: pendingIssue?.label ?? "",
          student: pendingIssue?.candidate.student_name ?? "",
        })}
        description={tAtRisk("issueConfirm.body")}
        confirmLabel={t("issue", { level: pendingIssue?.label ?? "" })}
        confirming={issue.isPending}
        onConfirm={confirmIssue}
      />
    </Card>
  );
}
