"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useContainerMinWidth,
  useToast,
} from "@newsekolah/ui";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useId, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type AssessmentComponent,
  type TPMapping,
  useDeleteTPMappingMutation,
  useGradebookQuery,
  useSaveTPMappingMutation,
  useTPMappingsQuery,
} from "../api";
import { tpRangeProblem, type TPRangeProblem } from "../lib/tp-ranges";

import { RangeInputs, RangeProblem, type RangeScale } from "./tp-range-inputs";

interface RowState {
  export_code: string;
  r_min: string;
  r_max: string;
  t_min: string;
  t_max: string;
}

/**
 * The editor width (CSS px) from which the five-column table fits without
 * a sideways scroll, measured on its widest row: one with a saved mapping,
 * whose actions cell holds Hapus (icon and label) beside Simpan. That row
 * is about 870px wide with the range inputs and the export code at its
 * 192px minimum, which shows a realistic code such as TP-01-MATEMATIKA
 * whole; a row without a mapping is about 770px. Narrower, each component
 * gets its own card, whose code field spans the card. Wider, the export
 * code takes the spare room.
 */
const TABLE_MIN_WIDTH = 880;

/** Until the sheet loads: the API's default scale (0-100, two decimals). */
const DEFAULT_RANGE_SCALE: RangeScale = { min: 0, max: 100, decimals: 2 };

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
 *
 * The term is the page's own term picker (`termId`, empty for the active
 * term): the mapping never keeps a second picker that could disagree.
 */
export function TPMappingEditor({
  classId,
  subjectId,
  termId,
}: {
  classId: string;
  subjectId: string;
  termId?: string;
}): ReactElement {
  const t = useTranslations("app.grading.tpMapping");

  const gradebook = useGradebookQuery({ classId, subjectId, termId });
  const mappings = useTPMappingsQuery(classId, subjectId, termId);

  const tpKind = gradebook.data?.scale.tp_kind;
  const sheetScale = gradebook.data?.scale;
  const scale: RangeScale = sheetScale
    ? { min: sheetScale.min, max: sheetScale.max, decimals: sheetScale.round_decimal }
    : DEFAULT_RANGE_SCALE;
  const eligibleComponents = (gradebook.data?.components ?? []).filter(
    (c) => c.kind === "formative" || (tpKind !== undefined && c.kind === tpKind),
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-body-sm text-fg-muted">{t("description")}</p>

      {gradebook.isLoading || mappings.isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : eligibleComponents.length === 0 ? (
        <p className="text-body-sm text-fg-muted">{t("noComponents")}</p>
      ) : (
        <TPMappingRows
          key={`${classId}-${subjectId}-${gradebook.data?.term_id ?? ""}`}
          components={eligibleComponents}
          mappings={mappings.data?.data ?? []}
          scale={scale}
        />
      )}
    </div>
  );
}

interface RowProps {
  component: AssessmentComponent;
  row: RowState;
  scale: RangeScale;
  /** Shown once Simpan was pressed with ranges the API would refuse. */
  problem: TPRangeProblem | null;
  hasMapping: boolean;
  saving: boolean;
  removing: boolean;
  onChange: (patch: Partial<RowState>) => void;
  onSave: () => void;
  onRemove: () => void;
}

/**
 * Owns the row inputs for one class-subject-term. Keyed by that scope at
 * the call site, so switching term remounts it with a fresh initial state
 * instead of an effect resynchronizing local state from the loaded data.
 * A wide editor gets one table row per component; a narrow one (a phone,
 * or a tablet-width window beside the sidebar) gets one card per
 * component, so the T range and the row's own Simpan never sit behind a
 * sideways scroll. The switch follows the editor's own width.
 */
function TPMappingRows({
  components,
  mappings,
  scale,
}: {
  components: AssessmentComponent[];
  mappings: TPMapping[];
  scale: RangeScale;
}): ReactElement {
  const t = useTranslations("app.grading.tpMapping");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const save = useSaveTPMappingMutation();
  const remove = useDeleteTPMappingMutation();
  // The table switches on the room the editor really has, not the
  // viewport: with the desktop sidebar an 800px window leaves the card
  // about 510px, well short of the table's natural width.
  const [containerRef, isWide] = useContainerMinWidth(TABLE_MIN_WIDTH);

  const mappingByComponent = new Map(mappings.map((m) => [m.component_id, m]));
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const initial: Record<string, RowState> = {};
    for (const component of components) {
      const mapping = mappingByComponent.get(component.id);
      initial[component.id] = mapping ? fromMapping(mapping) : emptyRow();
    }
    return initial;
  });

  // Rows whose Simpan was pressed with ranges that cannot be saved: their
  // problem shows (and updates as the teacher fixes it) from then on.
  const [attempted, setAttempted] = useState<ReadonlySet<string>>(() => new Set());

  function updateRow(componentId: string, patch: Partial<RowState>) {
    setRows((current) => ({
      ...current,
      [componentId]: { ...(current[componentId] ?? emptyRow()), ...patch },
    }));
  }

  function showError(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  function saveRow(componentId: string) {
    const row = rows[componentId];
    if (!row?.export_code.trim()) return;
    if (tpRangeProblem(row, scale) !== null) {
      setAttempted((current) => new Set(current).add(componentId));
      return;
    }
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
        onError: showError,
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
      onError: showError,
    });
  }

  const rowProps = (component: AssessmentComponent): RowProps => ({
    component,
    row: rows[component.id] ?? emptyRow(),
    scale,
    problem: attempted.has(component.id)
      ? tpRangeProblem(rows[component.id] ?? emptyRow(), scale)
      : null,
    hasMapping: mappingByComponent.has(component.id),
    saving: save.isPending,
    removing: remove.isPending,
    onChange: (patch) => {
      updateRow(component.id, patch);
    },
    onSave: () => {
      saveRow(component.id);
    },
    onRemove: () => {
      deleteRow(component.id);
    },
  });

  return (
    <div ref={containerRef} className="w-full min-w-0">
      {isWide ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.component")}</TableHead>
              {/* The code column takes the table's spare width, so a long code
                  (up to 32 characters) shows whole instead of clipping. */}
              <TableHead className="w-full">{t("columns.exportCode")}</TableHead>
              <TableHead>{t("columns.rRange")}</TableHead>
              <TableHead>{t("columns.tRange")}</TableHead>
              <TableHead>{t("columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {components.map((component) => (
              <TPMappingTableRow key={component.id} {...rowProps(component)} />
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="flex flex-col gap-3">
          {components.map((component) => (
            <TPMappingCard key={component.id} {...rowProps(component)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RowActions({
  row,
  hasMapping,
  saving,
  removing,
  onSave,
  onRemove,
  fullWidth,
}: RowProps & { fullWidth: boolean }): ReactElement {
  const t = useTranslations("app.grading.tpMapping");
  return (
    <div className={fullWidth ? "flex flex-col gap-2" : "flex items-center gap-2"}>
      <Button
        size={fullWidth ? "md" : "sm"}
        className={fullWidth ? "w-full" : undefined}
        loading={saving}
        disabled={!row.export_code.trim()}
        onClick={onSave}
      >
        {t("save")}
      </Button>
      {hasMapping && (
        <Button
          size={fullWidth ? "md" : "sm"}
          variant="secondary"
          className={fullWidth ? "w-full" : undefined}
          icon={<Trash2 />}
          loading={removing}
          onClick={onRemove}
        >
          {t("remove")}
        </Button>
      )}
    </div>
  );
}

function TPMappingTableRow(props: RowProps): ReactElement {
  const t = useTranslations("app.grading.tpMapping");
  const { component, row, scale, problem, onChange } = props;
  const errorId = useId();
  const range = { row, scale, invalid: problem !== null, errorId, onChange };
  return (
    <TableRow>
      <TableCell>{component.code}</TableCell>
      <TableCell>
        <Input
          className="w-full max-w-xs min-w-48"
          aria-label={t("columns.exportCode")}
          value={row.export_code}
          maxLength={32}
          onChange={(e) => {
            onChange({ export_code: e.target.value });
          }}
        />
      </TableCell>
      <TableCell>
        <RangeInputs range="r" {...range} inputClassName="w-16" />
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <RangeInputs range="t" {...range} inputClassName="w-16" />
          <RangeProblem id={errorId} problem={problem} scale={scale} />
        </div>
      </TableCell>
      <TableCell>
        <RowActions {...props} fullWidth={false} />
      </TableCell>
    </TableRow>
  );
}

function TPMappingCard(props: RowProps): ReactElement {
  const t = useTranslations("app.grading.tpMapping");
  const { component, row, scale, problem, onChange } = props;
  const rLabelId = useId();
  const tLabelId = useId();
  const errorId = useId();
  const range = { row, scale, invalid: problem !== null, errorId, onChange };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{component.code}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <Field label={t("columns.exportCode")}>
          <Input
            className="w-full"
            value={row.export_code}
            maxLength={32}
            onChange={(e) => {
              onChange({ export_code: e.target.value });
            }}
          />
        </Field>
        <div role="group" aria-labelledby={rLabelId} className="flex flex-col gap-2">
          <span id={rLabelId} className="text-label text-fg">
            {t("columns.rRange")}
          </span>
          <RangeInputs range="r" {...range} inputClassName="min-w-0 flex-1" />
        </div>
        <div role="group" aria-labelledby={tLabelId} className="flex flex-col gap-2">
          <span id={tLabelId} className="text-label text-fg">
            {t("columns.tRange")}
          </span>
          <RangeInputs range="t" {...range} inputClassName="min-w-0 flex-1" />
        </div>
        <RangeProblem id={errorId} problem={problem} scale={scale} />
        <RowActions {...props} fullWidth />
      </CardContent>
    </Card>
  );
}
