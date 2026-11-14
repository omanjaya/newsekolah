"use client";

import { Field, SegmentedControl, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import {
  ReportExportDialog,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useClassesQuery, useGradeLevelsQuery } from "../../reference/api";
import { type RosterExportScope, downloadClassRosterExport } from "../class-roster-export-api";

/** Mirrors apps/api/internal/modules/academic/service/roster_export.go's rosterReportColumns. */
const ROSTER_EXPORT_COLUMN_KEYS = [
  "nis",
  "nisn",
  "name",
  "gender",
  "birth_place",
  "birth_date",
  "guardian_name",
] as const;

export interface ClassRosterExportProps {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The class roster download: ReportExportDialog with a class or grade
 * level ("angkatan") scope, opened on the class the reader is looking at.
 * The class panel opens it from its own button or menu.
 */
export function ClassRosterExport({
  classId,
  open,
  onOpenChange,
}: ClassRosterExportProps): ReactElement {
  const t = useTranslations("app.school.classes.rosterExport");
  const classes = useClassesQuery();
  const gradeLevels = useGradeLevelsQuery();
  const [scope, setScope] = useState<RosterExportScope>({ kind: "class", classId });

  // Each opening starts from the class on screen.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setScope({ kind: "class", classId });
  }

  async function handleExport(options: ReportExportOptions) {
    await downloadClassRosterExport(scope, options);
  }

  return (
    <ReportExportDialog
      open={open}
      onOpenChange={onOpenChange}
      reportKey="academic.class-roster"
      defaultTitle={t("defaultTitle")}
      availableColumns={ROSTER_EXPORT_COLUMN_KEYS.map((key) => ({
        key,
        label: t(`columns.${key}`),
      }))}
      onExport={handleExport}
      scopeSlot={
        <div className="flex flex-col gap-3">
          <SegmentedControl
            aria-label={t("scope")}
            options={[
              { value: "class", label: t("scopeClass") },
              { value: "gradeLevel", label: t("scopeGradeLevel") },
            ]}
            value={scope.kind}
            onValueChange={(value) => {
              setScope(
                value === "class"
                  ? { kind: "class", classId: "" }
                  : { kind: "gradeLevel", gradeLevelId: "" },
              );
            }}
          />
          {scope.kind === "class" ? (
            <Field label={t("scopeClass")}>
              <Select
                options={(classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                value={scope.classId}
                onValueChange={(value) => {
                  setScope({ kind: "class", classId: value });
                }}
                placeholder={t("scopeClassPlaceholder")}
                disabled={classes.isLoading}
              />
            </Field>
          ) : (
            <Field label={t("scopeGradeLevel")}>
              <Select
                options={(gradeLevels.data?.data ?? []).map((g) => ({
                  value: g.id,
                  label: g.name,
                }))}
                value={scope.gradeLevelId}
                onValueChange={(value) => {
                  setScope({ kind: "gradeLevel", gradeLevelId: value });
                }}
                placeholder={t("scopeGradeLevelPlaceholder")}
                disabled={gradeLevels.isLoading}
              />
            </Field>
          )}
        </div>
      }
    />
  );
}
