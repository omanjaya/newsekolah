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
  Select,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { GraduationCap, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";

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

const TEMPLATES: GradeLevelTemplate[] = ["sd", "smp", "sma", "smk"];

export function GradeLevelsView(): ReactElement {
  const t = useTranslations("app.academic.gradeLevels");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_master_data");
  const { data, isLoading } = useGradeLevelsQuery();
  const create = useCreateGradeLevelMutation();
  const update = useUpdateGradeLevelMutation();
  const remove = useDeleteGradeLevelMutation();
  const applyTemplate = useApplyGradeLevelTemplateMutation();

  const [editing, setEditing] = useState<GradeLevel | "new" | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sequence, setSequence] = useState("1");
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
    },
    [rows.length],
  );

  async function save() {
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
      { accessorKey: "sequence", header: t("columns.sequence"), enableSorting: false },
      { accessorKey: "code", header: t("columns.code"), enableSorting: false },
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
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
    [t, canManage, open],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[18px] font-medium text-fg">{t("title")}</h2>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Wand2 />}
              onClick={() => {
                setTemplateOpen(true);
              }}
            >
              {t("applyTemplate")}
            </Button>
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                open("new");
              }}
            >
              {t("add")}
            </Button>
          </div>
        )}
      </div>
      <DataTable
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
        getRowId={(g) => g.id}
        emptyState={
          <EmptyState
            icon={<GraduationCap aria-hidden="true" />}
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
              <span className="font-medium">{t("columns.code")}</span>
              <Input
                value={code}
                maxLength={8}
                onChange={(e) => {
                  setCode(e.target.value);
                }}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("columns.name")}</span>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("columns.sequence")}</span>
              <Input
                type="number"
                min={1}
                value={sequence}
                onChange={(e) => {
                  setSequence(e.target.value);
                }}
                className="w-24"
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

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent title={t("applyTemplate")}>
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-fg-muted">{t("applyTemplateBody")}</p>
            <Select
              options={TEMPLATES.map((value) => ({ value, label: t(`template.${value}`) }))}
              value={template}
              onValueChange={(value) => {
                setTemplate(value as GradeLevelTemplate);
              }}
            />
            <div className="flex justify-end gap-2 border-t border-border pt-4">
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
            </div>
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
