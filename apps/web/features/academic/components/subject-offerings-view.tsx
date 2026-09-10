"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
  Select,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { BookMarked, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useActiveYear } from "../../../lib/hooks/use-active-year";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useLookup, useSubjectsQuery } from "../../reference/api";
import { useAcademicYearsQuery } from "../api";
import { useGradeLevelsQuery } from "../api-master-data";
import {
  type SubjectOffering,
  useCreateSubjectOfferingMutation,
  useDeleteSubjectOfferingMutation,
  useSubjectOfferingsQuery,
  useUpdateSubjectOfferingMutation,
} from "../api-offerings";

interface OfferingDraft {
  subjectId: string;
  gradeLevelId: string;
  hoursPerWeek: string;
}

const EMPTY_DRAFT: OfferingDraft = { subjectId: "", gradeLevelId: "", hoursPerWeek: "2" };

/** Which subjects are taught in an academic year, optionally scoped to one grade level. */
export function SubjectOfferingsView(): ReactElement {
  const t = useTranslations("app.academic.subjectOfferings");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_master_data");
  const activeYear = useActiveYear();
  const years = useAcademicYearsQuery();
  const [yearId, setYearId] = useState("");
  const effectiveYearId = yearId || activeYear.id;

  const offerings = useSubjectOfferingsQuery(effectiveYearId);
  const subjects = useSubjectsQuery();
  const gradeLevels = useGradeLevelsQuery();
  const subjectMap = useLookup(subjects.data?.data);
  const gradeLevelMap = useLookup(gradeLevels.data?.data);

  const create = useCreateSubjectOfferingMutation(effectiveYearId);
  const update = useUpdateSubjectOfferingMutation(effectiveYearId);
  const remove = useDeleteSubjectOfferingMutation(effectiveYearId);

  const [editing, setEditing] = useState<SubjectOffering | "new" | null>(null);
  const [draft, setDraft] = useState<OfferingDraft>(EMPTY_DRAFT);
  const [pendingDelete, setPendingDelete] = useState<SubjectOffering | null>(null);

  const rows = offerings.data?.data ?? [];

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  function open(target: SubjectOffering | "new") {
    setEditing(target);
    setDraft(
      target === "new"
        ? EMPTY_DRAFT
        : {
            subjectId: target.subject_id,
            gradeLevelId: target.grade_level_id ?? "",
            hoursPerWeek: String(target.hours_per_week),
          },
    );
  }

  async function save() {
    const hours = Number.parseInt(draft.hoursPerWeek, 10);
    if (!hours || (editing === "new" && !draft.subjectId)) return;
    try {
      if (editing === "new") {
        await create.mutateAsync({
          subject_id: draft.subjectId,
          grade_level_id: draft.gradeLevelId || undefined,
          hours_per_week: hours,
        });
      } else if (editing) {
        await update.mutateAsync({
          id: editing.id,
          body: { grade_level_id: draft.gradeLevelId || undefined, hours_per_week: hours },
        });
      }
      toast.success(t("saved"));
      setEditing(null);
    } catch (error) {
      fail(error);
    }
  }

  const columns = useMemo<ColumnDef<SubjectOffering>[]>(
    () => [
      {
        id: "subject",
        header: t("columns.subject"),
        enableSorting: false,
        cell: ({ row }) => subjectMap.get(row.original.subject_id)?.name ?? "-",
      },
      {
        id: "gradeLevel",
        header: t("columns.gradeLevel"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.grade_level_id
            ? (gradeLevelMap.get(row.original.grade_level_id)?.name ?? "-")
            : t("allGrades"),
      },
      { accessorKey: "hours_per_week", header: t("columns.hoursPerWeek"), enableSorting: false },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canManage ? (
            <div className="flex justify-end gap-1">
              <IconButton
                icon={<Pencil />}
                aria-label={t("edit")}
                onClick={() => {
                  open(row.original);
                }}
              />
              <IconButton
                icon={<Trash2 />}
                aria-label={t("delete")}
                onClick={() => {
                  setPendingDelete(row.original);
                }}
              />
            </div>
          ) : null,
      },
    ],
    [t, canManage, subjectMap, gradeLevelMap],
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canManage && (
            <Button
              size="sm"
              icon={<Plus />}
              disabled={!effectiveYearId}
              onClick={() => {
                open("new");
              }}
            >
              {t("add")}
            </Button>
          )
        }
      />
      <label className="flex w-fit flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("year")}</span>
        <Select
          options={(years.data?.data ?? []).map((y) => ({ value: y.id, label: y.label }))}
          value={effectiveYearId}
          onValueChange={setYearId}
          className="w-64"
        />
      </label>
      <DataTable
        data={rows}
        columns={columns}
        rowCount={rows.length}
        pagination={{ pageIndex: 0, pageSize: 100 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        isLoading={offerings.isLoading}
        getRowId={(o) => o.id}
        emptyState={
          <EmptyState
            icon={<BookMarked aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent title={editing === "new" ? t("add") : t("edit")}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("columns.subject")}</span>
              <Select
                options={(subjects.data?.data ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                value={draft.subjectId}
                onValueChange={(subjectId) => {
                  setDraft((d) => ({ ...d, subjectId }));
                }}
                disabled={editing !== "new"}
                placeholder={t("pickSubject")}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("columns.gradeLevel")}</span>
              <Select
                options={[
                  { value: "", label: t("allGrades") },
                  ...(gradeLevels.data?.data ?? []).map((g) => ({ value: g.id, label: g.name })),
                ]}
                value={draft.gradeLevelId}
                onValueChange={(gradeLevelId) => {
                  setDraft((d) => ({ ...d, gradeLevelId }));
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("columns.hoursPerWeek")}</span>
              <Input
                type="number"
                min={1}
                value={draft.hoursPerWeek}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, hoursPerWeek: e.target.value }));
                }}
                className="w-24"
                required
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                }}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" loading={create.isPending || update.isPending}>
                {t("save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deleteTitle")}
        description={
          pendingDelete
            ? t("deleteBody", { name: subjectMap.get(pendingDelete.subject_id)?.name ?? "" })
            : ""
        }
        confirmLabel={t("delete")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success(t("deleted"));
          } catch (error) {
            fail(error);
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </div>
  );
}
