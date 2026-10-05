"use client";

import {
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
  domainIcons,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { bentoCells } from "../../../lib/layout/bento";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useTeachingAssignmentsForTeacherQuery } from "../../academic/api-offerings";
import { useClassesQuery, useSubjectsQuery } from "../../reference/api";
import { useGradebookQuery, useTermsQuery } from "../api";
import { gradebookFillPercentage } from "../lib/gradebook-stats";

import { EraporExport } from "./erapor-export";
import { GradebookSheet } from "./gradebook-sheet";
import { GradingAssignmentCard } from "./grading-assignment-card";
import { GradingEntryTiles } from "./grading-entry-tiles";
import { GradingSettings } from "./grading-settings";
import { TPMappingEditor } from "./tp-mapping-editor";

type Tab = "gradebook" | "settings" | "erapor" | "tp";

/** One (class, subject) pair this teacher is assigned to teach, deduplicated across terms. */
interface AssignmentPair {
  classId: string;
  subjectId: string;
}

/**
 * The teacher's gradebook screen: pick a class and subject, then work in
 * either the score sheet or (for staff with manage_settings) the shared
 * grading scale and report-score increase ranges.
 */
export function GradingView(): ReactElement {
  const t = useTranslations("app.grading");
  const canManageGrades = useCan("manage_grades");
  // view_grades is the read-only split of manage_grades (e.g. the
  // principal oversight role): every score/component/weight/publication
  // control stays hidden (GradebookSheet's canManage prop, still driven
  // by canManageGrades alone below), but the sheet itself, its export
  // and the e-Rapor preview/download render with real values.
  const canViewGrades = useCan("view_grades");
  const canManageSettings = useCan("manage_settings");

  // The server lets staff with manage_master_data open any sheet to
  // manage it, or a view_reports holder read any sheet (grading/
  // transport/http/handler.go's canViewAny -- the same supervisory
  // bypass attendance's Actor.CanViewAll uses); a teacher gets the
  // classes and subjects they are assigned to teach, so the pickers
  // never offer a sheet that would come back forbidden.
  const canManageAny = useCan("manage_master_data");
  const canViewReports = useCan("view_reports");
  const canOpenAny = canManageAny || canViewReports;
  const { me } = useSession();
  const year = useActiveYear();
  const assignments = useTeachingAssignmentsForTeacherQuery(
    canOpenAny ? "" : year.id,
    canOpenAny ? "" : (me?.id ?? ""),
  );

  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const terms = useTermsQuery();
  const activeAssignments = useMemo(
    () => (assignments.data?.data ?? []).filter((a) => a.is_active),
    [assignments.data],
  );
  const classList = useMemo(() => {
    const all = classes.data?.data ?? [];
    if (canOpenAny) return all;
    const taught = new Set(activeAssignments.map((a) => a.class_id));
    return all.filter((c) => taught.has(c.id));
  }, [canOpenAny, classes.data, activeAssignments]);

  // Every distinct (class, subject) this teacher teaches, independent of
  // which class/subject the pickers currently point at -- the entry
  // page's bento cards (docs/07-ui-ux.md): one per teaching assignment,
  // not one per term it happens to span.
  const assignmentPairs = useMemo<AssignmentPair[]>(() => {
    if (canOpenAny) return [];
    const seen = new Set<string>();
    const pairs: AssignmentPair[] = [];
    for (const a of activeAssignments) {
      const key = `${a.class_id}:${a.subject_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ classId: a.class_id, subjectId: a.subject_id });
    }
    return pairs;
  }, [canOpenAny, activeAssignments]);

  const [classId, setClassId] = useUrlState<string>(
    "class",
    ["", ...classList.map((item) => item.id)],
    "",
  );
  const effectiveClassId = classId || (classList[0]?.id ?? "");

  const subjectList = useMemo(() => {
    const all = subjects.data?.data ?? [];
    if (canOpenAny) return all;
    const taught = new Set(
      activeAssignments.filter((a) => a.class_id === effectiveClassId).map((a) => a.subject_id),
    );
    return all.filter((s) => taught.has(s.id));
  }, [canOpenAny, subjects.data, activeAssignments, effectiveClassId]);

  const [subjectId, setSubjectId] = useUrlState<string>(
    "subject",
    ["", ...subjectList.map((item) => item.id)],
    "",
  );
  const [termId, setTermId] = useUrlState<string>(
    "term",
    ["", ...(terms.data?.data ?? []).map((item) => item.id)],
    "",
  );
  const [tab, setTab] = useUrlState<Tab>(
    "tab",
    [
      "gradebook",
      ...(canManageGrades ? (["tp"] as const) : []),
      ...(canManageGrades || canViewGrades ? (["erapor"] as const) : []),
      ...(canManageSettings || canManageGrades ? (["settings"] as const) : []),
    ],
    "gradebook",
  );
  const [pendingChanges, setPendingChanges] = useState(0);

  const classOptions = classList.map((c) => ({ value: c.id, label: c.name }));
  const subjectOptions = subjectList.map((s) => ({ value: s.id, label: s.name }));
  const termOptions = [
    { value: "", label: t("allTerms") },
    ...(terms.data?.data ?? []).map((term) => ({ value: term.id, label: term.name })),
  ];
  // A subject picked for one class may not be taught in the next, so the
  // sheet falls back to the first subject this class offers.
  const effectiveSubjectId =
    subjectId && subjectList.some((s) => s.id === subjectId)
      ? subjectId
      : (subjectList[0]?.id ?? "");
  const scopeLoading =
    classes.isLoading || subjects.isLoading || (!canOpenAny && assignments.isLoading);
  const noAssignments = !canOpenAny && !scopeLoading && classList.length === 0;

  function changeScope(change: () => void) {
    if (pendingChanges > 0 && !window.confirm(t("table.discardChanges"))) return;
    setPendingChanges(0);
    change();
  }

  function openAssignment(pair: AssignmentPair) {
    changeScope(() => {
      setClassId(pair.classId);
      setSubjectId(pair.subjectId);
    });
  }

  // Shared with GradebookSheet's own identical call (same query key once
  // termId's "" normalizes to undefined the same way there): TanStack
  // Query dedupes them into one request, so the entry tiles cost nothing
  // extra over opening the sheet by itself.
  const overviewSheet = useGradebookQuery({
    classId: effectiveClassId,
    subjectId: effectiveSubjectId,
    termId: termId || undefined,
  });

  const showEntryOverview =
    tab === "gradebook" &&
    !scopeLoading &&
    !noAssignments &&
    effectiveClassId &&
    effectiveSubjectId;

  const assignmentCells = bentoCells(
    assignmentPairs.map((pair) => ({
      key: `${pair.classId}:${pair.subjectId}`,
      node: (
        <GradingAssignmentCard
          classId={pair.classId}
          subjectId={pair.subjectId}
          termId={termId || undefined}
          className={classList.find((c) => c.id === pair.classId)?.name ?? ""}
          subjectName={subjectList.find((s) => s.id === pair.subjectId)?.name ?? ""}
          active={pair.classId === effectiveClassId && pair.subjectId === effectiveSubjectId}
          onOpen={() => {
            openAssignment(pair);
          }}
        />
      ),
    })),
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <>
            <Select
              options={classOptions}
              value={effectiveClassId}
              onValueChange={(value) => {
                changeScope(() => {
                  setClassId(value);
                });
              }}
              placeholder={t("pickClass")}
              aria-label={t("pickClass")}
              className="w-full rounded-full md:w-48"
            />
            <Select
              options={subjectOptions}
              value={effectiveSubjectId}
              onValueChange={(value) => {
                changeScope(() => {
                  setSubjectId(value);
                });
              }}
              placeholder={t("pickSubject")}
              aria-label={t("pickSubject")}
              className="w-full rounded-full md:w-48"
            />
            <Select
              options={termOptions}
              value={termId}
              onValueChange={(value) => {
                changeScope(() => {
                  setTermId(value);
                });
              }}
              aria-label={t("pickTerm")}
              className="w-full rounded-full md:w-40"
            />
          </>
        }
      />

      {(canManageSettings || canManageGrades || canViewGrades) && (
        <Tabs
          value={tab}
          onValueChange={(value) => {
            changeScope(() => {
              setTab(value as Tab);
            });
          }}
        >
          <TabsList>
            <TabsTrigger value="gradebook">{t("tabGradebook")}</TabsTrigger>
            {canManageGrades && <TabsTrigger value="tp">{t("tabTpMapping")}</TabsTrigger>}
            {(canManageGrades || canViewGrades) && (
              <TabsTrigger value="erapor">{t("tabErapor")}</TabsTrigger>
            )}
            {(canManageSettings || canManageGrades) && (
              <TabsTrigger value="settings">{t("tabSettings")}</TabsTrigger>
            )}
          </TabsList>
        </Tabs>
      )}

      {tab === "settings" && (canManageSettings || canManageGrades) ? (
        <GradingSettings canManageSettings={canManageSettings} />
      ) : tab === "erapor" && (canManageGrades || canViewGrades) ? (
        <EraporExport />
      ) : tab === "tp" && canManageGrades && effectiveClassId && effectiveSubjectId ? (
        <TPMappingEditor
          key={`tp-${effectiveClassId}-${effectiveSubjectId}`}
          classId={effectiveClassId}
          subjectId={effectiveSubjectId}
        />
      ) : scopeLoading ? (
        <Skeleton className="h-96 w-full" aria-busy="true" />
      ) : noAssignments ? (
        <EmptyState
          icon={<domainIcons.grades aria-hidden="true" />}
          title={t("noAssignmentsTitle")}
          description={t("noAssignmentsBody")}
        />
      ) : effectiveClassId && effectiveSubjectId ? (
        <div className="flex flex-col gap-6">
          {showEntryOverview && overviewSheet.data && (
            <GradingEntryTiles
              studentCount={overviewSheet.data.students.length}
              componentCount={overviewSheet.data.components.length}
              fillPercent={gradebookFillPercentage(
                overviewSheet.data.students,
                overviewSheet.data.components.length,
              )}
              isPublished={overviewSheet.data.is_published}
            />
          )}

          {assignmentPairs.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2" data-testid="grading-assignment-cards">
              {assignmentCells.map((cell) => (
                <div
                  key={cell.key}
                  data-testid={`grading-assignment-cell-${cell.key}`}
                  className={cn("flex h-full flex-col", cell.span === "full" && "lg:col-span-2")}
                >
                  <div className="flex-1">{cell.node}</div>
                </div>
              ))}
            </div>
          )}

          <GradebookSheet
            key={`${effectiveClassId}-${effectiveSubjectId}`}
            classId={effectiveClassId}
            subjectId={effectiveSubjectId}
            termId={termId || undefined}
            className={classList.find((c) => c.id === effectiveClassId)?.name ?? ""}
            subjectName={subjectList.find((s) => s.id === effectiveSubjectId)?.name ?? ""}
            canManage={canManageGrades}
            onPendingChangesChange={setPendingChanges}
          />
        </div>
      ) : (
        <p className="text-[13px] text-fg-muted">{t("pickBoth")}</p>
      )}
    </div>
  );
}
