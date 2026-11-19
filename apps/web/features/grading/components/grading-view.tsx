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
import { useEffect, useMemo, useRef, useState } from "react";

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
  // control stays hidden (GradebookSheet's canManage prop, canEditSheet
  // below), but the sheet itself, its export and the e-Rapor
  // preview/download render with real values.
  const canViewGrades = useCan("view_grades");
  const canManageSettings = useCan("manage_settings");

  // The server lets staff with manage_master_data open any sheet to
  // manage it, or a view_reports holder read any sheet (grading/
  // transport/http/handler.go's canViewAny -- the same supervisory
  // bypass attendance's Actor.CanViewAll uses); a teacher gets the
  // classes and subjects they are assigned to teach, so the pickers
  // never offer a sheet that would come back forbidden. Reading any
  // sheet is not editing it: every write still needs the actor to teach
  // the pair (or manage_master_data), so a school-wide reader who also
  // teaches (a counselor, a vice principal) still loads their own
  // assignments to know which sheets they may edit.
  const canManageAny = useCan("manage_master_data");
  const canViewReports = useCan("view_reports");
  const canOpenAny = canManageAny || canViewReports;
  const needsAssignments = !canOpenAny || (canManageGrades && !canManageAny);
  const { me } = useSession();
  const year = useActiveYear();
  const assignments = useTeachingAssignmentsForTeacherQuery(
    needsAssignments ? year.id : "",
    needsAssignments ? (me?.id ?? "") : "",
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
    const seen = new Set<string>();
    const pairs: AssignmentPair[] = [];
    for (const a of activeAssignments) {
      const pair = { classId: a.class_id, subjectId: a.subject_id };
      if (seen.has(pairKey(pair))) continue;
      seen.add(pairKey(pair));
      pairs.push(pair);
    }
    return pairs;
  }, [activeAssignments]);

  const [classId, setClassId] = useUrlState<string>(
    "class",
    ["", ...classList.map((item) => item.id)],
    "",
  );
  // A school-wide reader who also teaches starts on a sheet they teach
  // (the one they most likely came to fill), not the school's first class.
  const effectiveClassId = classId || (assignmentPairs[0]?.classId ?? classList[0]?.id ?? "");

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
  const scopeLoading =
    classes.isLoading || subjects.isLoading || (needsAssignments && assignments.isLoading);
  const noAssignments = !canOpenAny && !scopeLoading && classList.length === 0;

  // The TP mapping and the e-Rapor export both work on classes the actor
  // teaches (or any class for a school-wide reader): with none, the sheet
  // tab's own empty state is the whole story, not a red error elsewhere.
  const showTpTab = canManageGrades && !noAssignments;
  const showEraporTab = (canManageGrades || canViewGrades) && !noAssignments;
  const showSettingsTab = canManageSettings || canManageGrades;
  const [tab, setTab] = useUrlState<Tab>(
    "tab",
    [
      "gradebook",
      ...(showTpTab ? (["tp"] as const) : []),
      ...(showEraporTab ? (["erapor"] as const) : []),
      ...(showSettingsTab ? (["settings"] as const) : []),
    ],
    "gradebook",
  );
  const [pendingChanges, setPendingChanges] = useState(0);

  // A subject picked for one class may not be taught in the next, so the
  // sheet falls back to a subject the actor teaches in this class, else
  // the first subject this class offers.
  const effectiveSubjectId =
    subjectId && subjectList.some((s) => s.id === subjectId)
      ? subjectId
      : (assignmentPairs.find((pair) => pair.classId === effectiveClassId)?.subjectId ??
        subjectList[0]?.id ??
        "");
  // The sheet is editable only where the server accepts the writes: a
  // pair the actor teaches, or any pair for manage_master_data. Anything
  // else a school-wide reader opens is the same read-only sheet a
  // view_grades-only principal sees.
  const canEditSheet =
    canManageGrades &&
    (canManageAny ||
      assignmentPairs.some(
        (pair) => pair.classId === effectiveClassId && pair.subjectId === effectiveSubjectId,
      ));

  // Publishing writes the actor's own sheets, so the e-Rapor panel may send
  // only someone who teaches in the exported class (or manage_master_data,
  // which writes anywhere) to publish. A counselor or vice principal with
  // manage_grades but no teaching assignment there only reads.
  const canPublishIn = (exportClassId: string) =>
    canManageGrades &&
    (canManageAny || assignmentPairs.some((pair) => pair.classId === exportClassId));

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

  // The legacy per-subject e-Rapor file is cut per (class, subject), so a
  // teacher is offered the subjects they teach in the exported class.
  const eraporSubjectsOf = (exportClassId: string) => {
    const all = subjects.data?.data ?? [];
    if (canOpenAny) return all;
    const taught = new Set(
      activeAssignments.filter((a) => a.class_id === exportClassId).map((a) => a.subject_id),
    );
    return all.filter((s) => taught.has(s.id));
  };

  // "Open the gradebook" from the e-Rapor panel unmounts the button that
  // was pressed; focus follows the reader into the sheet panel instead of
  // falling back to the top of the page. Radix renders the chosen panel
  // `hidden` in the commit where the tab changes and shows it only in the
  // render its Presence schedules next, and a browser does not focus a
  // hidden element: focusing it in this effect left focus on <body>
  // (audit r5-r4-n10). A frame later the panel is shown.
  const gradebookPanelRef = useRef<HTMLDivElement>(null);
  const focusGradebookOnOpen = useRef(false);
  useEffect(() => {
    if (tab !== "gradebook" || !focusGradebookOnOpen.current) return;
    const frame = requestAnimationFrame(() => {
      focusGradebookOnOpen.current = false;
      gradebookPanelRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [tab]);

  const classNameOf = (id: string) => classes.data?.data.find((c) => c.id === id)?.name ?? "";
  const subjectNameOf = (id: string) => subjects.data?.data.find((s) => s.id === id)?.name ?? "";

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
    // On a phone the class and the term share the first row and the
    // subject, the longest name, takes the second whole; from sm one row
    // in reading order.
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
      <div className="col-span-2 max-sm:order-last sm:col-span-1">
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
      </div>
      <div className="min-w-0">{termSelect}</div>
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
      canManage={canEditSheet}
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
        <TabsContent
          ref={gradebookPanelRef}
          value="gradebook"
          className="flex flex-col pt-0 md:min-h-0 md:flex-1"
        >
          {gradebookPanel}
        </TabsContent>
        {showTpTab && (
          <TabsContent value="tp" className="pt-0">
            {!(effectiveClassId && effectiveSubjectId) ? (
              gradebookPanel
            ) : canEditSheet ? (
              <TPMappingEditor
                key={`tp-${effectiveClassId}-${effectiveSubjectId}-${termId}`}
                classId={effectiveClassId}
                subjectId={effectiveSubjectId}
                termId={termId || undefined}
              />
            ) : (
              <EmptyState
                icon={<domainIcons.grades aria-hidden="true" />}
                title={t("tpReadOnlyTitle")}
                description={t("tpReadOnlyBody")}
              />
            )}
          </TabsContent>
        )}
        {showEraporTab && (
          <TabsContent value="erapor" className="pt-0">
            <EraporExport
              classes={classList}
              loading={scopeLoading}
              classesError={classes.error}
              onRetryClasses={() => {
                void classes.refetch();
              }}
              retryingClasses={classes.isRefetching}
              defaultClassId={effectiveClassId}
              subjectsOf={eraporSubjectsOf}
              canPublishIn={canPublishIn}
              onOpenGradebook={(exportClassId) => {
                changeScope(() => {
                  // Land on a sheet of the exported class the actor can
                  // publish, not whichever sheet the gradebook last showed.
                  setClassId(exportClassId);
                  const taught = assignmentPairs.filter((pair) => pair.classId === exportClassId);
                  if (
                    taught.length > 0 &&
                    !taught.some((p) => p.subjectId === effectiveSubjectId)
                  ) {
                    setSubjectId(taught[0]?.subjectId ?? "");
                  }
                  focusGradebookOnOpen.current = true;
                  setTab("gradebook");
                });
              }}
            />
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
