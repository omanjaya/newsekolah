"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  NumberInput,
  RowActionsMenu,
  Select,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { BookMarked, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
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

import type { HubPageProps } from "./hub-page";

interface OfferingDraft {
  subjectId: string;
  gradeLevelId: string;
  hoursPerWeek: string;
}

const EMPTY_DRAFT: OfferingDraft = { subjectId: "", gradeLevelId: "", hoursPerWeek: "2" };

/** Which subjects are taught in an academic year, optionally scoped to one grade level. */
export function SubjectOfferingsView({ page }: { page: HubPageProps }): ReactElement {
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
            <RowActionsMenu
              ariaLabel={t("rowActions", {
                name: subjectMap.get(row.original.subject_id)?.name ?? "",
              })}
              items={[
                {
                  label: t("edit"),
                  icon: <Pencil />,
                  onClick: () => {
                    open(row.original);
                  },
                },
                {
                  label: t("delete"),
                  icon: <Trash2 />,
                  tone: "danger",
                  onClick: () => {
                    setPendingDelete(row.original);
                  },
                },
              ]}
            />
          ) : null,
      },
    ],
    [t, canManage, subjectMap, gradeLevelMap],
  );

  return (
    <AppPage
      {...page}
      primaryAction={
        canManage ? (
          <Button
            icon={<Plus />}
            disabled={!effectiveYearId}
            onClick={() => {
              open("new");
            }}
          >
            {t("add")}
          </Button>
        ) : undefined
      }
    >
      <Field label={t("year")} className="md:w-64">
        <Select
          options={(years.data?.data ?? []).map((y) => ({ value: y.id, label: y.label }))}
          value={effectiveYearId}
          onValueChange={setYearId}
        />
      </Field>
      <DataTable
        stateKey="features/academic/components/subject-offerings-view:1"
        mode="local"
        data={rows}
        columns={columns}
        rowCount={rows.length}
        pagination={{ pageIndex: 0, pageSize: 100 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={offerings.isLoading}
        getRowId={(o) => o.id}
        fillHeight
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
            <Field label={t("columns.subject")}>
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
            </Field>
            <Field label={t("columns.gradeLevel")}>
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
            </Field>
            <Field label={t("columns.hoursPerWeek")}>
              <NumberInput
                min={1}
                value={draft.hoursPerWeek ? Number(draft.hoursPerWeek) : null}
                onChange={(value) => {
                  setDraft((d) => ({ ...d, hoursPerWeek: value === null ? "" : String(value) }));
                }}
                className="w-24"
              />
            </Field>
            <DialogFooter>
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
            </DialogFooter>
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
        tone="danger"
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
    </AppPage>
  );
}
