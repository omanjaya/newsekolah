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
import type { ColumnDef, SortingFn } from "@tanstack/react-table";
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

type Lookup<T> = ReadonlyMap<string, T>;

/** The subject's name, or "-" while subjects load. */
function subjectNameOf(offering: SubjectOffering, subjects: Lookup<{ name: string }>): string {
  return subjects.get(offering.subject_id)?.name ?? "-";
}

/** The grade level's name, `allGrades` for an offering to every grade, or "-" while grades load. */
function gradeLevelNameOf(
  offering: SubjectOffering,
  gradeLevels: Lookup<{ name: string }>,
  allGrades: string,
): string {
  if (!offering.grade_level_id) return allGrades;
  return gradeLevels.get(offering.grade_level_id)?.name ?? "-";
}

/**
 * The grade level's place in the school's sequence, so a sort by grade
 * reads X, XI, XII rather than by name; an offering for every grade comes
 * first.
 */
function gradeSequenceOf(
  offering: SubjectOffering,
  gradeLevels: Lookup<{ sequence?: number }>,
): number {
  if (!offering.grade_level_id) return -1;
  return gradeLevels.get(offering.grade_level_id)?.sequence ?? Number.MAX_SAFE_INTEGER;
}

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

  const gradeLevelName = (offering: SubjectOffering) =>
    gradeLevelNameOf(offering, gradeLevelMap, t("allGrades"));

  const columns = useMemo<ColumnDef<SubjectOffering>[]>(() => {
    const subjectName = (offering: SubjectOffering) => subjectNameOf(offering, subjectMap);
    const gradeName = (offering: SubjectOffering) =>
      gradeLevelNameOf(offering, gradeLevelMap, t("allGrades"));
    // The API lists offerings grade by grade, each grade's subjects by
    // name; the subject, grade and hours headers re-sort them.
    const byGradeSequence: SortingFn<SubjectOffering> = (a, b) =>
      gradeSequenceOf(a.original, gradeLevelMap) - gradeSequenceOf(b.original, gradeLevelMap);
    return [
      {
        // Read through accessors (not only cells) so the search box finds
        // a subject or grade level by its name.
        id: "subject",
        header: t("columns.subject"),
        accessorFn: subjectName,
        sortingFn: "text",
      },
      {
        id: "gradeLevel",
        header: t("columns.gradeLevel"),
        accessorFn: gradeName,
        sortingFn: byGradeSequence,
      },
      { accessorKey: "hours_per_week", header: t("columns.hoursPerWeek"), sortingFn: "basic" },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canManage ? (
            <RowActionsMenu
              ariaLabel={t("rowActions", {
                name: subjectName(row.original),
                gradeLevel: gradeName(row.original),
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
    ];
  }, [t, canManage, subjectMap, gradeLevelMap]);

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
      primaryActionCompact={
        canManage
          ? {
              icon: <Plus />,
              label: t("add"),
              disabled: !effectiveYearId,
              onSelect: () => {
                open("new");
              },
            }
          : undefined
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
        toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
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
          // Name the grade: only that grade's offering goes, the subject
          // stays in the year for the other grades.
          pendingDelete
            ? pendingDelete.grade_level_id
              ? t("deleteBody", {
                  name: subjectNameOf(pendingDelete, subjectMap),
                  gradeLevel: gradeLevelName(pendingDelete),
                })
              : t("deleteBodyAllGrades", { name: subjectNameOf(pendingDelete, subjectMap) })
            : ""
        }
        confirmLabel={t("delete")}
        tone="danger"
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            const name = subjectNameOf(pendingDelete, subjectMap);
            toast.success(
              pendingDelete.grade_level_id
                ? t("deleted", { name, gradeLevel: gradeLevelName(pendingDelete) })
                : t("deletedAllGrades", { name }),
            );
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
