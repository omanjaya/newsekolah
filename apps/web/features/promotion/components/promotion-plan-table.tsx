"use client";

import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  SegmentedControl,
  Select,
  domainIcons,
  selectionColumn,
  type DataTableProps,
} from "@newsekolah/ui";
import type { RowSelectionState } from "@tanstack/react-table";
import { ChevronDown, School } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { StudentLink } from "../../students/components/student-link";
import type { PromotionAction, PromotionOverride, PromotionPlanItem } from "../api";

export const PROMOTION_ACTIONS: PromotionAction[] = ["promote", "retain", "graduate", "transfer"];

const needsClass = (action: PromotionAction) => action === "promote" || action === "retain";

interface ClassOption {
  value: string;
  label: string;
}

/**
 * The promotion plan as a table: one row per student with the decision
 * and the destination class, a filter for the rows that still need a
 * class and one per source class, and bulk changes for the ticked rows,
 * so a whole class is mapped to its next class in two clicks.
 */
export function PromotionPlanTable({
  rows,
  studentName,
  fromClasses,
  toClasses,
  onOverride,
}: {
  rows: PromotionPlanItem[];
  studentName: (id: string) => string;
  fromClasses: ClassOption[];
  toClasses: ClassOption[];
  onOverride: (overrides: PromotionOverride[]) => void;
}): ReactElement {
  const t = useTranslations("app.promotion");
  const [show, setShow] = useState<"all" | "unresolved">("all");
  const [fromClass, setFromClass] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pickingClass, setPickingClass] = useState(false);
  const [bulkClass, setBulkClass] = useState("");
  const unresolved = rows.filter((row) => row.unresolved).length;
  const classLabel = useMemo(
    () => new Map(fromClasses.map((option) => [option.value, option.label])),
    [fromClasses],
  );

  const visible = rows.filter(
    (row) =>
      (show === "all" || row.unresolved) && (fromClass === "" || row.from_class_id === fromClass),
  );
  const selected = rows.filter((row) => rowSelection[row.student_user_id]);

  function applyAction(action: PromotionAction) {
    onOverride(
      selected.map((row) => ({
        student_user_id: row.student_user_id,
        action,
        target_class_id: needsClass(action) ? row.target_class_id : undefined,
      })),
    );
    setRowSelection({});
  }

  const columns = useMemo<DataTableProps<PromotionPlanItem>["columns"]>(
    () => [
      selectionColumn<PromotionPlanItem>(),
      {
        id: "student",
        header: t("table.student"),
        accessorFn: (row) => studentName(row.student_user_id),
        meta: { card: "title" },
        cell: ({ row }) => (
          <span className="font-medium text-fg">
            <StudentLink studentId={row.original.student_user_id}>
              {studentName(row.original.student_user_id)}
            </StudentLink>
          </span>
        ),
      },
      {
        id: "fromClass",
        header: t("table.fromClass"),
        accessorFn: (row) => classLabel.get(row.from_class_id) ?? "",
        meta: { card: "subtitle" },
        cell: ({ getValue }) => (
          <span className="text-fg-muted">{(getValue() as string) || "-"}</span>
        ),
      },
      {
        id: "decision",
        header: t("table.action"),
        enableSorting: false,
        meta: { label: t("table.action") },
        cell: ({ row }) => (
          <Select
            aria-label={t("table.actionFor", { name: studentName(row.original.student_user_id) })}
            options={PROMOTION_ACTIONS.map((a) => ({ value: a, label: t(`action.${a}`) }))}
            value={row.original.action}
            onValueChange={(action) => {
              onOverride([
                {
                  student_user_id: row.original.student_user_id,
                  action: action as PromotionAction,
                  target_class_id: needsClass(action as PromotionAction)
                    ? row.original.target_class_id
                    : undefined,
                },
              ]);
            }}
            size="sm"
            className="md:w-36"
          />
        ),
      },
      {
        id: "targetClass",
        header: t("table.targetClass"),
        enableSorting: false,
        meta: { label: t("table.targetClass") },
        cell: ({ row }) =>
          needsClass(row.original.action) ? (
            <Select
              aria-label={t("table.targetFor", {
                name: studentName(row.original.student_user_id),
              })}
              options={toClasses}
              value={row.original.target_class_id ?? ""}
              onValueChange={(targetClassId) => {
                onOverride([
                  {
                    student_user_id: row.original.student_user_id,
                    action: row.original.action,
                    target_class_id: targetClassId,
                  },
                ]);
              }}
              placeholder={t("table.chooseClass")}
              invalid={row.original.unresolved}
              size="sm"
              className="md:w-40"
            />
          ) : (
            <span className="text-fg-muted">-</span>
          ),
      },
    ],
    [classLabel, onOverride, studentName, t, toClasses],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          aria-label={t("showLabel")}
          options={[
            { value: "all", label: t("showAll"), count: rows.length },
            { value: "unresolved", label: t("showUnresolved"), count: unresolved },
          ]}
          value={show}
          onValueChange={setShow}
        />
        {fromClasses.length > 1 && (
          <Select
            aria-label={t("table.fromClass")}
            options={[{ value: "all", label: t("allClasses") }, ...fromClasses]}
            value={fromClass || "all"}
            onValueChange={(value) => {
              setFromClass(value === "all" ? "" : value);
            }}
            className="sm:w-56"
          />
        )}
      </div>
      <DataTable
        mode="local"
        stateKey="features/promotion/components/promotion-plan-table:1"
        data={visible}
        columns={columns}
        getRowId={(row) => row.student_user_id}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        toolbarLabels={{ searchPlaceholder: t("searchStudent") }}
        bulkActions={
          <>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary" icon={<ChevronDown />}>
                  {t("bulkSetAction")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {PROMOTION_ACTIONS.map((action) => (
                  <DropdownMenuItem
                    key={action}
                    onSelect={() => {
                      applyAction(action);
                    }}
                  >
                    {t(`action.${action}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              variant="secondary"
              icon={<School />}
              onClick={() => {
                setBulkClass("");
                setPickingClass(true);
              }}
            >
              {t("bulkSetClass")}
            </Button>
          </>
        }
        emptyState={
          <EmptyState
            icon={<domainIcons.users aria-hidden="true" />}
            title={show === "unresolved" ? t("allResolved") : t("emptyTitle")}
          />
        }
      />
      <Dialog open={pickingClass} onOpenChange={setPickingClass}>
        <DialogContent
          title={t("bulkSetClass")}
          description={t("bulkSetClassBody", { n: selected.length })}
          size="sm"
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onOverride(
                selected.map((row) => ({
                  student_user_id: row.student_user_id,
                  action: needsClass(row.action) ? row.action : "promote",
                  target_class_id: bulkClass,
                })),
              );
              setRowSelection({});
              setPickingClass(false);
            }}
          >
            <Field label={t("table.targetClass")} required>
              <Select
                options={toClasses}
                value={bulkClass}
                onValueChange={setBulkClass}
                placeholder={t("table.chooseClass")}
              />
            </Field>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setPickingClass(false);
                }}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={!bulkClass}>
                {t("apply")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
