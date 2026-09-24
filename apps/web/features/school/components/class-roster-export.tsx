"use client";

import { Button, Select, Tabs, TabsList, TabsTrigger } from "@newsekolah/ui";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import {
  ReportExportDialog,
  type ReportExportOptions,
} from "../../../components/report-export-dialog";
import { useClassesQuery, useGradeLevelsQuery } from "../../reference/api";
import { type RosterExportScope, downloadClassRosterExport } from "../class-roster-export-api";

const ROSTER_EXPORT_COLUMNS = [
  { key: "nis", label: "NIS" },
  { key: "nisn", label: "NISN" },
  { key: "name", label: "Nama Siswa" },
  { key: "gender", label: "Jenis Kelamin" },
  { key: "birth_place", label: "Tempat Lahir" },
  { key: "birth_date", label: "Tanggal Lahir" },
  { key: "guardian_name", label: "Nama Wali" },
];

export interface ClassRosterExportProps {
  classId: string;
}

/**
 * A "Download roster" button on the class panel: opens
 * ReportExportDialog for the class roster export (mirroring
 * apps/api/internal/modules/academic/service/roster_export.go's
 * rosterReportColumns exactly), with a class/grade-level ("angkatan")
 * scope picker defaulting to the currently open class.
 */
export function ClassRosterExport({ classId }: ClassRosterExportProps): ReactElement {
  const t = useTranslations("app.school.classes.rosterExport");
  const classes = useClassesQuery();
  const gradeLevels = useGradeLevelsQuery();

  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<RosterExportScope>({ kind: "class", classId });

  async function handleExport(options: ReportExportOptions) {
    await downloadClassRosterExport(scope, options);
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={<Download />}
        onClick={() => {
          setScope({ kind: "class", classId });
          setOpen(true);
        }}
      >
        {t("button")}
      </Button>
      <ReportExportDialog
        open={open}
        onOpenChange={setOpen}
        reportKey="academic.class-roster"
        defaultTitle={t("defaultTitle")}
        availableColumns={ROSTER_EXPORT_COLUMNS}
        onExport={handleExport}
        scopeSlot={
          <div className="flex flex-wrap items-end gap-3">
            <Tabs
              value={scope.kind}
              onValueChange={(value) => {
                if (value === "class") {
                  setScope({ kind: "class", classId: "" });
                } else {
                  setScope({ kind: "gradeLevel", gradeLevelId: "" });
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="class">{t("scopeClass")}</TabsTrigger>
                <TabsTrigger value="gradeLevel">{t("scopeGradeLevel")}</TabsTrigger>
              </TabsList>
            </Tabs>
            {scope.kind === "class" ? (
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium text-fg">{t("scopeClass")}</span>
                <Select
                  options={(classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                  value={scope.classId}
                  onValueChange={(value) => {
                    setScope({ kind: "class", classId: value });
                  }}
                  placeholder={t("scopeClassPlaceholder")}
                  disabled={classes.isLoading}
                  aria-label={t("scopeClass")}
                  className="w-56"
                />
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium text-fg">{t("scopeGradeLevel")}</span>
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
                  aria-label={t("scopeGradeLevel")}
                  className="w-56"
                />
              </label>
            )}
          </div>
        }
      />
    </>
  );
}
