"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Skeleton, useToast } from "@newsekolah/ui";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type AssessmentComponent,
  type TPMapping,
  useDeleteTPMappingMutation,
  useGradebookQuery,
  useSaveTPMappingMutation,
  useTPMappingsQuery,
  useTermsQuery,
} from "../api";

interface RowState {
  export_code: string;
  r_min: string;
  r_max: string;
  t_min: string;
  t_max: string;
}

function emptyRow(): RowState {
  return { export_code: "", r_min: "", r_max: "", t_min: "", t_max: "" };
}

function fromMapping(mapping: TPMapping): RowState {
  return {
    export_code: mapping.export_code,
    r_min: String(mapping.r_min),
    r_max: String(mapping.r_max),
    t_min: String(mapping.t_min),
    t_max: String(mapping.t_max),
  };
}

/**
 * Maps this class-subject-term's eligible components (formative, or the
 * tenant's configured TP kind) to e-Rapor export codes with their R and T
 * ranges, so exportErapor and exportEraporLegacy know how to fill those
 * columns. A component keeps no mapping until one is saved for it.
 */
export function TPMappingEditor({
  classId,
  subjectId,
}: {
  classId: string;
  subjectId: string;
}): ReactElement {
  const t = useTranslations("app.grading.tpMapping");
  const terms = useTermsQuery();
  const [termId, setTermId] = useState("");
  const effectiveTermId = termId || (terms.data?.data[0]?.id ?? "");

  const gradebook = useGradebookQuery({ classId, subjectId, termId: effectiveTermId });
  const mappings = useTPMappingsQuery(classId, subjectId, effectiveTermId);

  const tpKind = gradebook.data?.scale.tp_kind;
  const eligibleComponents = (gradebook.data?.components ?? []).filter(
    (c) => c.kind === "formative" || (tpKind !== undefined && c.kind === tpKind),
  );

  const termOptions = (terms.data?.data ?? []).map((term) => ({
    value: term.id,
    label: term.name,
  }));

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("pickTerm")}</span>
        <Select
          options={termOptions}
          value={effectiveTermId}
          onValueChange={setTermId}
          className="w-56"
        />
      </label>

      {gradebook.isLoading || mappings.isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : eligibleComponents.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("noComponents")}</p>
      ) : (
        <TPMappingTable
          key={`${classId}-${subjectId}-${effectiveTermId}`}
          components={eligibleComponents}
          mappings={mappings.data?.data ?? []}
        />
      )}
    </div>
  );
}

/**
 * Owns the row inputs for one class-subject-term. Keyed by that scope at
 * the call site, so switching term remounts it with a fresh initial state
 * instead of an effect resynchronizing local state from the loaded data.
 */
function TPMappingTable({
  components,
  mappings,
}: {
  components: AssessmentComponent[];
  mappings: TPMapping[];
}): ReactElement {
  const t = useTranslations("app.grading.tpMapping");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const save = useSaveTPMappingMutation();
  const remove = useDeleteTPMappingMutation();

  const mappingByComponent = new Map(mappings.map((m) => [m.component_id, m]));
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const initial: Record<string, RowState> = {};
    for (const component of components) {
      const mapping = mappingByComponent.get(component.id);
      initial[component.id] = mapping ? fromMapping(mapping) : emptyRow();
    }
    return initial;
  });

  function updateRow(componentId: string, patch: Partial<RowState>) {
    setRows((current) => ({
      ...current,
      [componentId]: { ...(current[componentId] ?? emptyRow()), ...patch },
    }));
  }

  function saveRow(componentId: string) {
    const row = rows[componentId];
    if (!row?.export_code.trim()) return;
    save.mutate(
      {
        component_id: componentId,
        export_code: row.export_code.trim(),
        r_min: Number(row.r_min),
        r_max: Number(row.r_max),
        t_min: Number(row.t_min),
        t_max: Number(row.t_max),
      },
      {
        onSuccess: () => {
          toast.success(t("saved"));
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  function deleteRow(componentId: string) {
    const mapping = mappingByComponent.get(componentId);
    if (!mapping) {
      updateRow(componentId, emptyRow());
      return;
    }
    remove.mutate(mapping.id, {
      onSuccess: () => {
        toast.success(t("deleted"));
        updateRow(componentId, emptyRow());
      },
      onError: (error) => {
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        );
      },
    });
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-border">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-fg-muted">
            <th className="px-3 py-2 font-medium">{t("columns.component")}</th>
            <th className="px-3 py-2 font-medium">{t("columns.exportCode")}</th>
            <th className="px-3 py-2 font-medium">{t("columns.rRange")}</th>
            <th className="px-3 py-2 font-medium">{t("columns.tRange")}</th>
            <th className="px-3 py-2 font-medium">{t("columns.actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {components.map((component) => {
            const row = rows[component.id] ?? emptyRow();
            const hasMapping = mappingByComponent.has(component.id);
            return (
              <tr key={component.id}>
                <td className="px-3 py-2 text-fg">{component.code}</td>
                <td className="px-3 py-2">
                  <Input
                    className="w-28"
                    value={row.export_code}
                    maxLength={32}
                    onChange={(e) => {
                      updateRow(component.id, { export_code: e.target.value });
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Input
                      className="w-16"
                      type="number"
                      aria-label={t("columns.rMin")}
                      value={row.r_min}
                      onChange={(e) => {
                        updateRow(component.id, { r_min: e.target.value });
                      }}
                    />
                    <span className="text-fg-muted">-</span>
                    <Input
                      className="w-16"
                      type="number"
                      aria-label={t("columns.rMax")}
                      value={row.r_max}
                      onChange={(e) => {
                        updateRow(component.id, { r_max: e.target.value });
                      }}
                    />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Input
                      className="w-16"
                      type="number"
                      aria-label={t("columns.tMin")}
                      value={row.t_min}
                      onChange={(e) => {
                        updateRow(component.id, { t_min: e.target.value });
                      }}
                    />
                    <span className="text-fg-muted">-</span>
                    <Input
                      className="w-16"
                      type="number"
                      aria-label={t("columns.tMax")}
                      value={row.t_max}
                      onChange={(e) => {
                        updateRow(component.id, { t_max: e.target.value });
                      }}
                    />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      loading={save.isPending}
                      disabled={!row.export_code.trim()}
                      onClick={() => {
                        saveRow(component.id);
                      }}
                    >
                      {t("save")}
                    </Button>
                    {hasMapping && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Trash2 />}
                        loading={remove.isPending}
                        onClick={() => {
                          deleteRow(component.id);
                        }}
                      >
                        {t("remove")}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
