import { Select, Tabs, TabsList, TabsTrigger } from "@newsekolah/ui";
import type { ReactElement } from "react";

import type { ClassRef, GradeLevel } from "../../reference/api";
import type { GradebookExportScope } from "../gradebook-export-api";

interface GradebookExportScopePickerProps {
  scope: GradebookExportScope;
  onScopeChange: (scope: GradebookExportScope) => void;
  classes: ClassRef[] | undefined;
  gradeLevels: GradeLevel[] | undefined;
  classesLoading: boolean;
  gradeLevelsLoading: boolean;
  classLabel: string;
  gradeLevelLabel: string;
  classPlaceholder: string;
  gradeLevelPlaceholder: string;
}

/**
 * A class-or-grade-level ("angkatan") scope picker for the gradebook
 * export dialog, mirroring features/attendance's identically shaped
 * ReportScopePicker (duplicated rather than shared: the two features'
 * component trees do not otherwise depend on each other).
 */
export function GradebookExportScopePicker(props: GradebookExportScopePickerProps): ReactElement {
  const {
    scope,
    onScopeChange,
    classes,
    gradeLevels,
    classesLoading,
    gradeLevelsLoading,
    classLabel,
    gradeLevelLabel,
    classPlaceholder,
    gradeLevelPlaceholder,
  } = props;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Tabs
        value={scope.kind}
        onValueChange={(value) => {
          if (value === "class") {
            onScopeChange({ kind: "class", classId: "" });
          } else {
            onScopeChange({ kind: "gradeLevel", gradeLevelId: "" });
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="class">{classLabel}</TabsTrigger>
          <TabsTrigger value="gradeLevel">{gradeLevelLabel}</TabsTrigger>
        </TabsList>
      </Tabs>
      {scope.kind === "class" ? (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{classLabel}</span>
          <Select
            options={(classes ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={scope.classId}
            onValueChange={(value) => {
              onScopeChange({ kind: "class", classId: value });
            }}
            placeholder={classPlaceholder}
            disabled={classesLoading}
            aria-label={classLabel}
            className="w-56"
          />
        </label>
      ) : (
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{gradeLevelLabel}</span>
          <Select
            options={(gradeLevels ?? []).map((g) => ({ value: g.id, label: g.name }))}
            value={scope.gradeLevelId}
            onValueChange={(value) => {
              onScopeChange({ kind: "gradeLevel", gradeLevelId: value });
            }}
            placeholder={gradeLevelPlaceholder}
            disabled={gradeLevelsLoading}
            aria-label={gradeLevelLabel}
            className="w-56"
          />
        </label>
      )}
    </div>
  );
}

/** True once scope names a concrete class or grade level, ready to export. */
export function gradebookScopeIsReady(scope: GradebookExportScope): boolean {
  return scope.kind === "class" ? scope.classId !== "" : scope.gradeLevelId !== "";
}
