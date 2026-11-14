"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  ConfirmDialog,
  domainIcons,
  EmptyState,
  IconButton,
  SearchInput,
  SectionHeader,
  SemanticStatusBadge,
  SkeletonList,
  Switch,
  useToast,
} from "@newsekolah/ui";
import { Download, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useId, useMemo, useState } from "react";

import {
  ReportExportDialog,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClassesQuery, useGradeLevelsQuery } from "../../reference/api";
import {
  type AssessmentComponent,
  type GradebookStudent,
  useClassStarBalancesQuery,
  useGradebookQuery,
  useSetGradePublicationMutation,
} from "../api";
import { type GradebookExportScope, downloadGradebookExport } from "../gradebook-export-api";
import {
  gradebookClassAverage,
  gradebookFillPercentage,
  gradebookTuntasRate,
  gradebookUngradedCount,
} from "../lib/gradebook-stats";

import { ComponentDialog } from "./component-dialog";
import { GradebookExportScopePicker } from "./gradebook-export-scope-picker";
import { GradebookSummaryStrip } from "./gradebook-summary-strip";
import { GradebookTable } from "./gradebook-table";
import { ManualScoreDialog } from "./manual-score-dialog";
import { StarDialog } from "./star-dialog";

export interface GradebookSheetProps {
  classId: string;
  subjectId: string;
  termId?: string;
  /** The class's display name ("X-A"), for the sheet's title -- not a CSS class. */
  className?: string;
  subjectName?: string;
  canManage: boolean;
  onPendingChangesChange?: (count: number) => void;
}

/**
 * One class-subject sheet as a single-focus workspace: the sheet's name with
 * its publish status (the one place it is shown) and the export, one
 * summary strip, then the search and "Tambah komponen" right above the
 * scores. On a wide screen it fills the page's height and the table scrolls
 * inside it, so the component names stay in view.
 */
export function GradebookSheet({
  classId,
  subjectId,
  termId,
  className: classDisplayName,
  subjectName,
  canManage,
  onPendingChangesChange,
}: GradebookSheetProps): ReactElement {
  const t = useTranslations("app.grading.sheet");
  const tGrading = useTranslations("app.grading");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const switchId = useId();
  const {
    data: sheet,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useGradebookQuery({ classId, subjectId, termId });
  const starBalancesQuery = useClassStarBalancesQuery(classId);
  const setPublication = useSetGradePublicationMutation();
  const classes = useClassesQuery();
  const gradeLevels = useGradeLevelsQuery();

  const [search, setSearch] = useState("");
  const [componentDialog, setComponentDialog] = useState<AssessmentComponent | "new" | null>(null);
  const [manualTarget, setManualTarget] = useState<GradebookStudent | null>(null);
  const [starTarget, setStarTarget] = useState<GradebookStudent | null>(null);
  const [pendingPublish, setPendingPublish] = useState<boolean | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<GradebookExportScope>({ kind: "class", classId });

  // availableColumns mirrors gradebook_export.go's gradebookReportColumns
  // exactly: No, Nama Siswa, one per this sheet's own components (key
  // "component_<id>", label the component's Code), Rata-rata, Nilai
  // Rapor. A grade-level export reuses this same class's component set
  // for its column choices too (the server does the same: Document.
  // Columns comes from the first class in scope).
  const exportColumns = useMemo(() => {
    const columns = [
      { key: "no", label: t("exportColumnNumber") },
      { key: "name", label: t("exportColumnName") },
    ];
    for (const component of sheet?.components ?? []) {
      columns.push({ key: `component_${component.id}`, label: component.code });
    }
    columns.push({ key: "average", label: t("exportColumnAverage") });
    columns.push({ key: "report_score", label: t("exportColumnReportScore") });
    return columns;
  }, [sheet, t]);

  async function handleExport(options: ReportExportOptions) {
    await downloadGradebookExport(exportScope, subjectId, sheet?.term_id, options);
  }

  // Hoisted out of the render body: `new Map()` inline gave GradebookTable a
  // fresh `starBalances` identity on every render of this component (e.g.
  // every keystroke in the search box) even when the underlying balances
  // had not changed, which a Map's reference identity cannot express to a
  // memoized consumer the way a primitive value can.
  const starBalances = useMemo(
    () => new Map((starBalancesQuery.data?.data ?? []).map((b) => [b.student_user_id, b.balance])),
    [starBalancesQuery.data],
  );

  const title = [classDisplayName, subjectName]
    .filter((part) => part && part.trim() !== "")
    .join(" · ");

  if (isLoading) {
    return <SkeletonList rows={6} leading={false} />;
  }
  if (error || !sheet) {
    return (
      <Alert
        variant="danger"
        title={t("loadError")}
        action={
          <Button
            size="sm"
            variant="secondary"
            loading={isRefetching}
            onClick={() => {
              void refetch();
            }}
          >
            {tGrading("table.retry")}
          </Button>
        }
      >
        {error instanceof ApiError ? apiErrorMessage(error.code) : undefined}
      </Alert>
    );
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

  const hasComponents = sheet.components.length > 0;

  const openExport = () => {
    setExportScope({ kind: "class", classId });
    setExportOpen(true);
  };
  const addComponent = () => {
    setComponentDialog("new");
  };

  return (
    // Pads itself clear of the sticky save bar while the bar shows (the
    // bar publishes its height), so the last rows never hide behind it.
    <div className="flex flex-col gap-4 pb-(--sticky-save-bar-height) md:min-h-0 md:flex-1">
      {/* The scope picker above already names the sheet on screen. */}
      <SectionHeader className="sr-only" title={title} />
      <div className="flex min-h-11 items-center justify-between gap-4">
        <p className="hidden text-body-sm text-fg-muted md:block">
          {t("meta", { students: sheet.students.length, components: sheet.components.length })}
        </p>
        {/* The sheet's one publish status. A manager toggles it right
            here; a read-only viewer only sees the badge. */}
        <div className="flex items-center gap-3">
          <SemanticStatusBadge
            status={sheet.is_published ? "published" : "draft"}
            label={sheet.is_published ? t("publishedBadge") : t("draftBadge")}
          />
          {canManage && (
            <span className="flex items-center gap-2">
              <Switch
                id={switchId}
                checked={sheet.is_published}
                onCheckedChange={(checked) => {
                  setPendingPublish(checked);
                }}
              />
              <label htmlFor={switchId} className="text-label text-fg-muted">
                {t("publishToggleLabel")}
              </label>
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={<Download />}
            className="hidden md:inline-flex"
            onClick={openExport}
          >
            {t("exportGradebook")}
          </Button>
        </div>
        <IconButton
          icon={<Download />}
          aria-label={t("exportGradebook")}
          variant="surface"
          className="md:hidden"
          onClick={openExport}
        />
      </div>

      {/* The figures sit above the scores on a wide screen and after them
          on a phone, where the scores have to start on the first screen. */}
      {hasComponents && (
        <div className="order-last md:order-none">
          <GradebookSummaryStrip
            studentCount={sheet.students.length}
            componentCount={sheet.components.length}
            fillPercent={gradebookFillPercentage(sheet.students, sheet.components.length)}
            classAverage={gradebookClassAverage(sheet.students)}
            tuntasRate={gradebookTuntasRate(sheet.students, sheet.scale.default_kktp)}
            ungradedCount={gradebookUngradedCount(sheet.students)}
          />
        </div>
      )}

      {hasComponents ? (
        <>
          <div className="hidden items-center gap-2 md:flex">
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="min-w-0 flex-1 md:max-w-xs"
            />
            {canManage && (
              <Button
                variant="secondary"
                icon={<Plus />}
                className="ml-auto shrink-0"
                onClick={addComponent}
              >
                {t("addComponent")}
              </Button>
            )}
          </div>
          <GradebookTable
            sheet={sheet}
            canManage={canManage}
            search={search}
            onSearchChange={setSearch}
            starBalances={starBalances}
            onEditComponent={setComponentDialog}
            onManualOverride={setManualTarget}
            onGiveStar={setStarTarget}
            onAddComponent={addComponent}
            onPendingChangesChange={onPendingChangesChange}
          />
        </>
      ) : (
        <EmptyState
          icon={<domainIcons.grades aria-hidden="true" />}
          title={t("emptyTitle")}
          description={canManage ? t("emptyBody") : t("emptyBodyReadOnly")}
          action={
            canManage && (
              <Button icon={<Plus />} onClick={addComponent}>
                {t("addComponent")}
              </Button>
            )
          }
        />
      )}

      <ReportExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        reportKey="grading.gradebook"
        defaultTitle={t("exportDefaultTitle")}
        availableColumns={exportColumns}
        onExport={handleExport}
        scopeSlot={
          <GradebookExportScopePicker
            scope={exportScope}
            onScopeChange={setExportScope}
            classes={classes.data?.data}
            gradeLevels={gradeLevels.data?.data}
            classesLoading={classes.isLoading}
            gradeLevelsLoading={gradeLevels.isLoading}
            classLabel={t("exportScopeClass")}
            gradeLevelLabel={t("exportScopeGradeLevel")}
            classPlaceholder={t("exportScopeClassPlaceholder")}
            gradeLevelPlaceholder={t("exportScopeGradeLevelPlaceholder")}
          />
        }
      />

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
