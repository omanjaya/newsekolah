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
  FirstUseEmptyState,
  Field,
  Input,
  NumberInput,
  RowActionsMenu,
  Select,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { GraduationCap, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type GradeLevel,
  type GradeLevelTemplate,
  useApplyGradeLevelTemplateMutation,
  useCreateGradeLevelMutation,
  useDeleteGradeLevelMutation,
  useGradeLevelsQuery,
  useUpdateGradeLevelMutation,
} from "../api-master-data";
import { codeRepeatsName } from "../lib/grade-level-code";

import type { HubPageProps } from "./hub-page";

const TEMPLATES: GradeLevelTemplate[] = ["sd", "smp", "sma", "smk"];

export function GradeLevelsView({ page }: { page: HubPageProps }): ReactElement {
  const t = useTranslations("app.academic.gradeLevels");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_master_data");
  const { data, isLoading, error, refetch, isRefetching } = useGradeLevelsQuery();
  const create = useCreateGradeLevelMutation();
  const update = useUpdateGradeLevelMutation();
  const remove = useDeleteGradeLevelMutation();
  const applyTemplate = useApplyGradeLevelTemplateMutation();

  const [editing, setEditing] = useState<GradeLevel | "new" | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sequence, setSequence] = useState("1");
  const [submitted, setSubmitted] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<GradeLevel | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [template, setTemplate] = useState<GradeLevelTemplate>("sd");

  const rows = [...(data?.data ?? [])].sort((a, b) => a.sequence - b.sequence);

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  const open = useCallback(
    (target: GradeLevel | "new") => {
      setEditing(target);
      setCode(target === "new" ? "" : target.code);
      setName(target === "new" ? "" : target.name);
      setSequence(target === "new" ? String(rows.length + 1) : String(target.sequence));
      setSubmitted(false);
    },
    [rows.length],
  );

  async function save() {
    setSubmitted(true);
    if (!code.trim() || !name.trim()) return;
    const body = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      sequence: Number.parseInt(sequence, 10) || 1,
    };
    try {
      if (editing === "new") await create.mutateAsync(body);
      else if (editing) await update.mutateAsync({ id: editing.id, body });
      toast.success(t("saved"));
      setEditing(null);
    } catch (error) {
      fail(error);
    }
  }

  const columns = useMemo<ColumnDef<GradeLevel>[]>(
    () => [
      // Name leads because the phone card uses the first column as its title.
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        meta: { card: "title" },
      },
      {
        accessorKey: "code",
        header: t("columns.code"),
        enableSorting: false,
        meta: { card: "subtitle" },
        // Cards only show below md: there a code that repeats the name
        // ("X" under "Kelas X") is left out; the table keeps every code.
        cell: ({ row }) => (
          <span
            className={
              codeRepeatsName(row.original.code, row.original.name) ? "max-md:hidden" : undefined
            }
          >
            {row.original.code}
          </span>
        ),
      },
      {
        accessorKey: "sequence",
        header: t("columns.sequence"),
        enableSorting: false,
        // A labelled "Urutan 1" row on the card, not a bare number.
        meta: { card: "field", align: "end" },
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canManage ? (
            <RowActionsMenu
              ariaLabel={t("rowActions", { name: row.original.name })}
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
    [t, canManage, open],
  );

  return (
    <AppPage
      {...page}
      primaryAction={
        canManage ? (
          <Button
            icon={<Plus />}
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
              onSelect: () => {
                open("new");
              },
            }
          : undefined
      }
      secondaryActions={
        canManage
          ? [
              {
                label: t("applyTemplate"),
                icon: <Wand2 />,
                onSelect: () => {
                  setTemplateOpen(true);
                },
              },
            ]
          : undefined
      }
    >
      <DataTable
        toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
        stateKey="features/academic/components/grade-levels-view:1"
        mode="local"
        data={rows}
        columns={columns}
        rowCount={rows.length}
        pagination={{ pageIndex: 0, pageSize: 100 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        retrying={isRefetching}
        getRowId={(g) => g.id}
        emptyState={
          // The header already carries the filled add button, so the empty
          // state offers the outline one (one filled button per action).
          canManage ? (
            <FirstUseEmptyState
              icon={<GraduationCap aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
              actionLabel={t("add")}
              onAction={() => {
                open("new");
              }}
            />
          ) : (
            <EmptyState
              icon={<GraduationCap aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
          )
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
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field
              label={t("columns.code")}
              required
              error={submitted && !code.trim() ? t("codeRequired") : undefined}
            >
              <Input
                value={code}
                maxLength={8}
                onChange={(e) => {
                  setCode(e.target.value);
                }}
              />
            </Field>
            <Field
              label={t("columns.name")}
              required
              error={submitted && !name.trim() ? t("nameRequired") : undefined}
            >
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            </Field>
            <Field label={t("columns.sequence")}>
              <NumberInput
                min={1}
                value={sequence ? Number(sequence) : null}
                onChange={(value) => {
                  setSequence(value === null ? "" : String(value));
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

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent title={t("applyTemplate")}>
          <div className="flex flex-col gap-4">
            <p className="text-body-sm text-fg-muted">{t("applyTemplateBody")}</p>
            <Select
              options={TEMPLATES.map((value) => ({ value, label: t(`template.${value}`) }))}
              value={template}
              onValueChange={(value) => {
                setTemplate(value as GradeLevelTemplate);
              }}
            />
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setTemplateOpen(false);
                }}
              >
                {t("cancel")}
              </Button>
              <Button
                loading={applyTemplate.isPending}
                onClick={() => {
                  applyTemplate.mutate(template, {
                    onSuccess: (result) => {
                      toast.success(t("templateApplied", { n: result.data.length }));
                      setTemplateOpen(false);
                    },
                    onError: fail,
                  });
                }}
              >
                {t("apply")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
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
