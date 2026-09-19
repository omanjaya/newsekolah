"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Skeleton,
  Switch,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type AssessmentComponent,
  type GradebookStudent,
  useClassStarBalancesQuery,
  useGradebookQuery,
  useSetGradePublicationMutation,
} from "../api";

import { ComponentDialog } from "./component-dialog";
import { GradebookTable } from "./gradebook-table";
import { ManualScoreDialog } from "./manual-score-dialog";
import { StarDialog } from "./star-dialog";

export interface GradebookSheetProps {
  classId: string;
  subjectId: string;
  canManage: boolean;
  onPendingChangesChange?: (count: number) => void;
}

/**
 * One class-subject sheet: the score grid plus the actions around it
 * (add/edit/delete component, manual report-score override, publish
 * toggle, stars). docs/07-ui-ux.md section 4's roster-grid pattern applied
 * to grading instead of attendance.
 */
export function GradebookSheet({
  classId,
  subjectId,
  canManage,
  onPendingChangesChange,
}: GradebookSheetProps): ReactElement {
  const t = useTranslations("app.grading.sheet");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { data: sheet, isLoading, error } = useGradebookQuery({ classId, subjectId });
  const starBalancesQuery = useClassStarBalancesQuery(classId);
  const setPublication = useSetGradePublicationMutation();

  const [search, setSearch] = useState("");
  const [componentDialog, setComponentDialog] = useState<AssessmentComponent | "new" | null>(null);
  const [manualTarget, setManualTarget] = useState<GradebookStudent | null>(null);
  const [starTarget, setStarTarget] = useState<GradebookStudent | null>(null);
  const [pendingPublish, setPendingPublish] = useState<boolean | null>(null);

  const starBalances = new Map(
    (starBalancesQuery.data?.data ?? []).map((b) => [b.student_user_id, b.balance]),
  );

  if (isLoading) {
    return <Skeleton className="h-96 w-full" aria-busy="true" />;
  }
  if (error || !sheet) {
    return <Alert variant="warning" title={t("loadError")} />;
  }

  async function confirmPublish() {
    if (pendingPublish === null || !sheet) return;
    try {
      await setPublication.mutateAsync({
        class_id: sheet.class_id,
        subject_id: sheet.subject_id,
        term_id: sheet.term_id,
        is_published: pendingPublish,
      });
      toast.success(pendingPublish ? t("publishedToast") : t("unpublishedToast"));
    } catch (err) {
      toast.error(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    } finally {
      setPendingPublish(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="w-64"
        />
        {canManage && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus />}
            onClick={() => {
              setComponentDialog("new");
            }}
          >
            {t("addComponent")}
          </Button>
        )}
        <label className="ml-auto flex items-center gap-2 text-[13px]">
          <span className="text-fg-muted">{t("publishToggleLabel")}</span>
          <Switch
            checked={sheet.is_published}
            disabled={!canManage}
            onCheckedChange={(checked) => {
              setPendingPublish(checked);
            }}
          />
        </label>
      </div>

      {sheet.components.length === 0 ? (
        <EmptyState
          icon={<domainIcons.grades aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            canManage && (
              <Button
                size="sm"
                icon={<Plus />}
                onClick={() => {
                  setComponentDialog("new");
                }}
              >
                {t("addComponent")}
              </Button>
            )
          }
        />
      ) : (
        <GradebookTable
          sheet={sheet}
          canManage={canManage}
          search={search}
          starBalances={starBalances}
          onEditComponent={setComponentDialog}
          onManualOverride={setManualTarget}
          onGiveStar={setStarTarget}
          onPendingChangesChange={onPendingChangesChange}
        />
      )}

      {componentDialog && (
        <ComponentDialog
          onOpenChange={(open) => {
            if (!open) setComponentDialog(null);
          }}
          classId={sheet.class_id}
          subjectId={sheet.subject_id}
          termId={sheet.term_id}
          nextSequence={sheet.components.length + 1}
          target={componentDialog}
        />
      )}

      {manualTarget && (
        <ManualScoreDialog
          onOpenChange={(open) => {
            if (!open) setManualTarget(null);
          }}
          classId={sheet.class_id}
          subjectId={sheet.subject_id}
          termId={sheet.term_id}
          studentId={manualTarget.student_user_id}
          studentName={manualTarget.name}
          computedAverage={manualTarget.average}
        />
      )}

      {starTarget && (
        <StarDialog
          onOpenChange={(open) => {
            if (!open) setStarTarget(null);
          }}
          studentId={starTarget.student_user_id}
          studentName={starTarget.name}
          classId={sheet.class_id}
          subjectId={sheet.subject_id}
          currentBalance={starBalances.get(starTarget.student_user_id) ?? 0}
        />
      )}

      <ConfirmDialog
        open={pendingPublish !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPublish(null);
        }}
        title={pendingPublish ? t("publishConfirmTitle") : t("unpublishConfirmTitle")}
        description={pendingPublish ? t("publishConfirmBody") : t("unpublishConfirmBody")}
        confirmLabel={pendingPublish ? t("confirmPublish") : t("confirmUnpublish")}
        confirming={setPublication.isPending}
        onConfirm={confirmPublish}
      />
    </div>
  );
}
