"use client";

import {
  Button,
  ConfirmDialog,
  EmptyState,
  Select,
  SkeletonList,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  domainIcons,
} from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useTeachingAssignmentsForTeacherQuery } from "../../academic/api-offerings";
import { useClassesQuery, useSubjectsQuery } from "../../reference/api";
import { useTermsQuery } from "../api";

import { EraporExport } from "./erapor-export";
import { GradebookSheet } from "./gradebook-sheet";
import { GradingSettings } from "./grading-settings";
import { TPMappingEditor } from "./tp-mapping-editor";

// Radix Select treats an empty value as "nothing chosen" and shows the
// placeholder, so "all terms" needs a real option value of its own.
const ALL_TERMS = "all";

type Tab = "gradebook" | "settings" | "erapor" | "tp";

/** One (class, subject) pair this teacher is assigned to teach, deduplicated across terms. */
interface AssignmentPair {
  classId: string;
  subjectId: string;
}

const pairKey = (pair: AssignmentPair) => `${pair.classId}:${pair.subjectId}`;

/**
 * The grading workspace: the score sheet of one class and subject is the
 * first thing on the page, under one scope bar (a teacher picks one of
 * their teaching assignments, a school-wide reader a class and a subject)
 * and the term. The TP mapping, the e-Rapor export and the grading
 * settings are panels of the same page.
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

  // Every distinct (class, subject) this teacher teaches, one per teaching
  // assignment rather than one per term it happens to span: a teacher's
  // whole scope fits one picker.
  const assignmentPairs = useMemo<AssignmentPair[]>(() => {
    if (canOpenAny) return [];
    const seen = new Set<string>();
    const pairs: AssignmentPair[] = [];
    for (const a of activeAssignments) {
      const pair = { classId: a.class_id, subjectId: a.subject_id };
      if (seen.has(pairKey(pair))) continue;
      seen.add(pairKey(pair));
      pairs.push(pair);
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

  // A subject picked for one class may not be taught in the next, so the
  // sheet falls back to the first subject this class offers.
  const effectiveSubjectId =
    subjectId && subjectList.some((s) => s.id === subjectId)
      ? subjectId
      : (subjectList[0]?.id ?? "");
  const scopeLoading =
    classes.isLoading || subjects.isLoading || (!canOpenAny && assignments.isLoading);
  const noAssignments = !canOpenAny && !scopeLoading && classList.length === 0;

  // A scope change (class, subject, term, tab) would drop unsaved scores, so
  // it waits behind a confirmation when there are any.
  const [pendingScopeChange, setPendingScopeChange] = useState<(() => void) | null>(null);

  function changeScope(change: () => void) {
    if (pendingChanges > 0) {
      setPendingScopeChange(() => change);
      return;
    }
    change();
  }

  const classNameOf = (id: string) => classes.data?.data.find((c) => c.id === id)?.name ?? "";
  const subjectNameOf = (id: string) => subjects.data?.data.find((s) => s.id === id)?.name ?? "";

  const showTpTab = canManageGrades && !noAssignments;
  const showEraporTab = canManageGrades || canViewGrades;
  const showSettingsTab = canManageSettings || canManageGrades;
  // The sheet panel is always there (it explains when there is no sheet).
  const tabCount = 1 + [showTpTab, showEraporTab, showSettingsTab].filter(Boolean).length;
  // The class and subject only steer the sheet and the TP mapping; the
  // e-Rapor export and the settings have scopes of their own.
  const showScope = !noAssignments && (tab === "gradebook" || tab === "tp");

  const termSelect = (
    <Select
      options={[
        { value: ALL_TERMS, label: t("allTerms") },
        ...(terms.data?.data ?? []).map((term) => ({ value: term.id, label: term.name })),
      ]}
      value={termId || ALL_TERMS}
      onValueChange={(value) => {
        changeScope(() => {
          setTermId(value === ALL_TERMS ? "" : value);
        });
      }}
      aria-label={t("pickTerm")}
      className="w-full sm:w-44"
    />
  );

  const scope = !showScope ? undefined : canOpenAny ? (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
      <Select
        options={classList.map((c) => ({ value: c.id, label: c.name }))}
        value={effectiveClassId}
        onValueChange={(value) => {
          changeScope(() => {
            setClassId(value);
          });
        }}
        placeholder={t("pickClass")}
        aria-label={t("pickClass")}
        className="w-full sm:w-40"
      />
      <Select
        options={subjectList.map((s) => ({ value: s.id, label: s.name }))}
        value={effectiveSubjectId}
        onValueChange={(value) => {
          changeScope(() => {
            setSubjectId(value);
          });
        }}
        placeholder={t("pickSubject")}
        aria-label={t("pickSubject")}
        className="w-full sm:w-48"
      />
      <div className="col-span-2 sm:col-span-1">{termSelect}</div>
    </div>
  ) : (
    <div className="grid w-full grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-2 sm:flex sm:w-auto">
      <Select
        options={assignmentPairs.map((pair) => ({
          value: pairKey(pair),
          label: [classNameOf(pair.classId), subjectNameOf(pair.subjectId)]
            .filter(Boolean)
            .join(" · "),
        }))}
        value={pairKey({ classId: effectiveClassId, subjectId: effectiveSubjectId })}
        onValueChange={(value) => {
          const pair = assignmentPairs.find((candidate) => pairKey(candidate) === value);
          if (!pair) return;
          changeScope(() => {
            setClassId(pair.classId);
            setSubjectId(pair.subjectId);
          });
        }}
        placeholder={t("pickAssignment")}
        aria-label={t("pickAssignment")}
        className="w-full sm:w-60"
      />
      <div className="min-w-0 sm:w-auto">{termSelect}</div>
    </div>
  );

  const gradebookPanel = scopeLoading ? (
    <SkeletonList rows={6} leading={false} />
  ) : noAssignments ? (
    <EmptyState
      icon={<domainIcons.grades aria-hidden="true" />}
      title={t("noAssignmentsTitle")}
      description={t("noAssignmentsBody")}
      action={
        <Button asChild variant="secondary">
          <Link href="/schedule">{t("openSchedule")}</Link>
        </Button>
      }
    />
  ) : effectiveClassId && effectiveSubjectId ? (
    <GradebookSheet
      key={`${effectiveClassId}-${effectiveSubjectId}`}
      classId={effectiveClassId}
      subjectId={effectiveSubjectId}
      termId={termId || undefined}
      className={classNameOf(effectiveClassId)}
      subjectName={subjectNameOf(effectiveSubjectId)}
      canManage={canManageGrades}
      onPendingChangesChange={setPendingChanges}
    />
  ) : (
    <EmptyState
      icon={<domainIcons.grades aria-hidden="true" />}
      title={t("pickBothTitle")}
      description={t("pickBoth")}
    />
  );

  // The sheet fills the screen's height on desktop so its table scrolls
  // under a header that stays put; the other panels scroll as a page.
  const fillsScreen = tab === "gradebook" && !noAssignments && !scopeLoading;

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        changeScope(() => {
          setTab(value as Tab);
        });
      }}
      className="contents"
    >
      <AppPage
        variant={fillsScreen ? "fit" : "wide"}
        actions={scope}
        nav={
          tabCount > 1 ? (
            <TabsList variant="underline" aria-label={t("tabsLabel")}>
              <TabsTrigger value="gradebook">{t("tabGradebook")}</TabsTrigger>
              {showTpTab && <TabsTrigger value="tp">{t("tabTpMapping")}</TabsTrigger>}
              {showEraporTab && <TabsTrigger value="erapor">{t("tabErapor")}</TabsTrigger>}
              {showSettingsTab && <TabsTrigger value="settings">{t("tabSettings")}</TabsTrigger>}
            </TabsList>
          ) : (
            false
          )
        }
      >
        <TabsContent value="gradebook" className="flex flex-col pt-0 md:min-h-0 md:flex-1">
          {gradebookPanel}
        </TabsContent>
        {showTpTab && (
          <TabsContent value="tp" className="pt-0">
            {effectiveClassId && effectiveSubjectId ? (
              <TPMappingEditor
                key={`tp-${effectiveClassId}-${effectiveSubjectId}`}
                classId={effectiveClassId}
                subjectId={effectiveSubjectId}
              />
            ) : (
              gradebookPanel
            )}
          </TabsContent>
        )}
        {showEraporTab && (
          <TabsContent value="erapor" className="pt-0">
            <EraporExport />
          </TabsContent>
        )}
        {showSettingsTab && (
          <TabsContent value="settings" className="pt-0">
            <GradingSettings canManageSettings={canManageSettings} />
          </TabsContent>
        )}
      </AppPage>

      <ConfirmDialog
        open={pendingScopeChange !== null}
        onOpenChange={(open) => {
          if (!open) setPendingScopeChange(null);
        }}
        title={t("table.discardChangesTitle")}
        description={t("table.discardChangesBody", { count: pendingChanges })}
        confirmLabel={t("table.discardChangesConfirm")}
        cancelLabel={t("table.discardChangesCancel")}
        tone="danger"
        onConfirm={() => {
          const change = pendingScopeChange;
          setPendingScopeChange(null);
          setPendingChanges(0);
          change?.();
        }}
      />
    </Tabs>
  );
}
