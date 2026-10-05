"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  SearchInput,
  Skeleton,
  Switch,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Download, MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

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
  gradebookTuntasRate,
  gradebookUngradedCount,
} from "../lib/gradebook-stats";

import { ComponentDialog } from "./component-dialog";
import { GradebookExportScopePicker } from "./gradebook-export-scope-picker";
import { GradebookPageTiles } from "./gradebook-page-tiles";
import { GradebookTable } from "./gradebook-table";
import { ManualScoreDialog } from "./manual-score-dialog";
import { StarDialog } from "./star-dialog";

export interface GradebookSheetProps {
  classId: string;
  subjectId: string;
  termId?: string;
  /** The class's display name ("X-A"), for the page title -- not a CSS class. */
  className?: string;
  subjectName?: string;
  canManage: boolean;
  onPendingChangesChange?: (count: number) => void;
}

/**
 * One class-subject sheet, restyled as the "Gradebook page"
 * (docs/07-ui-ux.md): a header titled "Kelas · Mapel" with the publish
 * switch and the e-Rapor export as pill actions, everything else
 * (add component, legacy actions) tucked under "Lainnya"; a compact
 * stat-tile row (class average, tuntas rate, not-yet-graded count); then
 * the score grid, unchanged, inside a card.
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
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const tApp = useTranslations("app");
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
      { key: "no", label: "No" },
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
    return <Skeleton className="h-96 w-full" aria-busy="true" />;
  }
  if (error || !sheet) {
    return (
      <Alert variant="warning" title={t("loadError")}>
        <div className="flex flex-col items-start gap-2">
          {error instanceof ApiError && <p>{apiErrorMessage(error.code)}</p>}
          <Button
            variant="secondary"
            loading={isRefetching}
            onClick={() => {
              void refetch();
            }}
          >
            {tApp("offlinePage.retry")}
          </Button>
        </div>
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

  return (
    <div className={canManage ? "flex flex-col gap-4 pb-24 md:pb-20" : "flex flex-col gap-4"}>
      {/*
       * A local, `h2`-level header rather than `PageHeader` (which renders
       * an `h1`): the page's own `h1` is the entry page's "Penilaian"
       * title (GradingView's PageHeader) -- this is the opened sheet
       * nested under it, not a second page.
       */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <h2 className="font-heading text-[20px] font-bold tracking-tight text-fg">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Primary pill: the publish switch itself, kept exactly as
                a `role="switch"` with its existing label so the existing
                publish flow (and its tests) keep working -- only its
                visual wrapper changed. A read-only viewer sees just the
                status badge, no edit control at all. */}
          <span
            className={
              sheet.is_published
                ? "flex items-center gap-2 rounded-full border border-accent bg-accent-soft px-3 py-1.5"
                : "flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5"
            }
          >
            <Badge variant={sheet.is_published ? "accent" : "neutral"}>
              {sheet.is_published ? t("publishedBadge") : t("draftBadge")}
            </Badge>
            {canManage && (
              <label className="flex items-center gap-2 text-[13px]">
                <span className="text-fg-muted">{t("publishToggleLabel")}</span>
                <Switch
                  checked={sheet.is_published}
                  onCheckedChange={(checked) => {
                    setPendingPublish(checked);
                  }}
                />
              </label>
            )}
          </span>

          <Button
            size="sm"
            variant="secondary"
            className="rounded-full"
            icon={<Download />}
            onClick={() => {
              setExportScope({ kind: "class", classId });
              setExportOpen(true);
            }}
          >
            {t("exportGradebook")}
          </Button>

          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="rounded-full">
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                  {t("moreActions")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setComponentDialog("new");
                  }}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {t("addComponent")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <GradebookPageTiles
        classAverage={gradebookClassAverage(sheet.students)}
        tuntasRate={gradebookTuntasRate(sheet.students, sheet.scale.default_kktp)}
        ungradedCount={gradebookUngradedCount(sheet.students)}
      />

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

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="w-full md:w-64"
            />
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
        </CardContent>
      </Card>

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
