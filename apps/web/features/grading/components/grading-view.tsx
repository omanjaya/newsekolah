"use client";

import { PageHeader, Select, Tabs, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { useClassesQuery, useSubjectsQuery } from "../../reference/api";

import { EraporExport } from "./erapor-export";
import { GradebookSheet } from "./gradebook-sheet";
import { GradingSettings } from "./grading-settings";
import { TPMappingEditor } from "./tp-mapping-editor";

type Tab = "gradebook" | "settings" | "erapor" | "tp";

/**
 * The teacher's gradebook screen: pick a class and subject, then work in
 * either the score sheet or (for staff with manage_settings) the shared
 * grading scale and report-score increase ranges.
 */
export function GradingView(): ReactElement {
  const t = useTranslations("app.grading");
  const canManageGrades = useCan("manage_grades");
  const canManageSettings = useCan("manage_settings");

  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const [classId, setClassId] = useUrlState<string>(
    "class",
    ["", ...(classes.data?.data ?? []).map((item) => item.id)],
    "",
  );
  const [subjectId, setSubjectId] = useUrlState<string>(
    "subject",
    ["", ...(subjects.data?.data ?? []).map((item) => item.id)],
    "",
  );
  const [tab, setTab] = useUrlState<Tab>(
    "tab",
    [
      "gradebook",
      ...(canManageGrades ? (["tp", "erapor"] as const) : []),
      ...(canManageSettings || canManageGrades ? (["settings"] as const) : []),
    ],
    "gradebook",
  );
  const [pendingChanges, setPendingChanges] = useState(0);

  const classOptions = (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const subjectOptions = (subjects.data?.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  const effectiveClassId = classId || (classes.data?.data[0]?.id ?? "");
  const effectiveSubjectId = subjectId || (subjects.data?.data[0]?.id ?? "");

  function changeScope(change: () => void) {
    if (pendingChanges > 0 && !window.confirm(t("table.discardChanges"))) return;
    setPendingChanges(0);
    change();
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <div className="flex flex-wrap items-center gap-3">
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
          className="w-56"
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
          className="w-56"
        />
        {(canManageSettings || canManageGrades) && (
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
              {canManageGrades && <TabsTrigger value="erapor">{t("tabErapor")}</TabsTrigger>}
              {(canManageSettings || canManageGrades) && (
                <TabsTrigger value="settings">{t("tabSettings")}</TabsTrigger>
              )}
            </TabsList>
          </Tabs>
        )}
      </div>

      {tab === "settings" && (canManageSettings || canManageGrades) ? (
        <GradingSettings canManageSettings={canManageSettings} />
      ) : tab === "erapor" && canManageGrades ? (
        <EraporExport />
      ) : tab === "tp" && canManageGrades && effectiveClassId && effectiveSubjectId ? (
        <TPMappingEditor
          key={`tp-${effectiveClassId}-${effectiveSubjectId}`}
          classId={effectiveClassId}
          subjectId={effectiveSubjectId}
        />
      ) : effectiveClassId && effectiveSubjectId ? (
        <GradebookSheet
          key={`${effectiveClassId}-${effectiveSubjectId}`}
          classId={effectiveClassId}
          subjectId={effectiveSubjectId}
          canManage={canManageGrades}
          onPendingChangesChange={setPendingChanges}
        />
      ) : (
        <p className="text-[13px] text-fg-muted">{t("pickBoth")}</p>
      )}
    </div>
  );
}
