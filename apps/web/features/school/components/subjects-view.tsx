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
  Input,
  RowActionsMenu,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSubjectsQuery } from "../../reference/api";
import {
  type Subject,
  useCreateSubjectMutation,
  useDeleteSubjectMutation,
  useUpdateSubjectMutation,
} from "../api";

export interface SubjectsViewProps {
  /**
   * Whether the "new subject" dialog is open, for a hub that renders
   * "Tambah mapel" (`app.school.subjects.add`) as its page's primary
   * action. Leave `onAddingChange` unset and the view keeps its own add
   * button above the table.
   */
  adding?: boolean;
  onAddingChange?: (adding: boolean) => void;
}

/** The school's subjects: a searchable table, an add and edit dialog, and a confirmed delete. */
export function SubjectsView({ adding, onAddingChange }: SubjectsViewProps = {}): ReactElement {
  const t = useTranslations("app.school.subjects");
  // The row menu is named as the user list names its own ("Aksi untuk Biologi").
  const tRow = useTranslations("app.school.users.actions");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { data, isLoading, error, refetch, isRefetching } = useSubjectsQuery();
  const remove = useDeleteSubjectMutation();
  const [editing, setEditing] = useState<Subject | null>(null);
  const [localAdding, setLocalAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Subject | null>(null);
  const [filter, setFilter] = useState("");

  const controlled = onAddingChange !== undefined;
  const isAdding = controlled ? (adding ?? false) : localAdding;
  const setAdding = onAddingChange ?? setLocalAdding;
  const target: Subject | "new" | null = editing ?? (isAdding ? "new" : null);

  const fail = (err: unknown) => {
    toast.error(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
  };

  function closeDialog() {
    setEditing(null);
    if (isAdding) setAdding(false);
  }

  const items = useMemo(() => {
    const all = data?.data ?? [];
    const q = filter.toLowerCase();
    return q
      ? all.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
      : all;
  }, [data, filter]);

  const columns = useMemo<ColumnDef<Subject>[]>(
    () => [
      {
        accessorKey: "code",
        header: t("columns.code"),
        enableSorting: false,
        meta: { card: "subtitle" },
      },
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        meta: { card: "title" },
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <RowActionsMenu
            ariaLabel={tRow("menuFor", { name: row.original.name })}
            items={[
              {
                label: t("edit"),
                icon: <Pencil />,
                onClick: () => {
                  setEditing(row.original);
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
        ),
      },
    ],
    [t, tRow],
  );

  return (
    // md:h-full: fills the tab panel's height so only the table rows scroll.
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      <DataTable
        toolbarActions={
          controlled ? undefined : (
            <Button
              icon={<Plus />}
              onClick={() => {
                setAdding(true);
              }}
            >
              {t("add")}
            </Button>
          )
        }
        stateKey="features/school/components/subjects-view:1"
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 100 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter={filter}
        onGlobalFilterChange={setFilter}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        retrying={isRefetching}
        getRowId={(s) => s.id}
        fillHeight
        // "Tambah mapel" is always on screen already, so the empty table
        // only explains itself.
        emptyState={
          <EmptyState
            icon={<domainIcons.grades aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />
      <Dialog
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) closeDialog();
        }}
      >
        <DialogContent title={target === "new" ? t("add") : t("edit")}>
          {target !== null && (
            <SubjectForm
              initial={target === "new" ? undefined : target}
              onDone={closeDialog}
              onError={fail}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        title={t("deleteTitle")}
        description={pendingDelete ? t("deleteBody", { name: pendingDelete.name }) : ""}
        confirmLabel={t("delete")}
        tone="danger"
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success(t("deleted"));
          } catch (err) {
            fail(err);
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </div>
  );
}

/**
 * The code and name of one subject. Both are required: marked on their
 * labels and said under the field on save, as the class form does, never
 * left to the browser's own bubble.
 */
function SubjectForm({
  initial,
  onDone,
  onError,
}: {
  initial?: Subject;
  onDone: () => void;
  onError: (error: unknown) => void;
}): ReactElement {
  const t = useTranslations("app.school.subjects");
  const tValidation = useTranslations("validation");
  const toast = useToast();
  const create = useCreateSubjectMutation();
  const update = useUpdateSubjectMutation();
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [submitted, setSubmitted] = useState(false);

  async function save() {
    setSubmitted(true);
    if (!code.trim() || !name.trim()) return;
    const body = { code: code.trim().toUpperCase(), name: name.trim() };
    try {
      if (initial) await update.mutateAsync({ id: initial.id, body });
      else await create.mutateAsync(body);
      toast.success(t("saved"));
      onDone();
    } catch (err) {
      onError(err);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field
        label={t("columns.code")}
        required
        error={submitted && !code.trim() ? tValidation("required") : undefined}
      >
        <Input
          value={code}
          maxLength={16}
          onChange={(e) => {
            setCode(e.target.value);
          }}
        />
      </Field>
      <Field
        label={t("columns.name")}
        required
        error={submitted && !name.trim() ? tValidation("required") : undefined}
      >
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending || update.isPending}>
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
