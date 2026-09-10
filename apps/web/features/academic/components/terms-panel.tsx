"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  IconButton,
  Input,
  Skeleton,
  useToast,
} from "@newsekolah/ui";
import { CircleCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type AcademicYear,
  type Term,
  useActivateTermMutation,
  useCreateTermMutation,
  useDeleteTermMutation,
  useTermsQuery,
  useUpdateTermMutation,
} from "../api";

interface TermDraft {
  name: string;
  sequence: string;
  starts_on: string;
  ends_on: string;
}

const EMPTY_DRAFT: TermDraft = { name: "", sequence: "1", starts_on: "", ends_on: "" };

/** Manages the terms (semesters) of one academic year, opened from the years list. */
export function TermsPanel({
  year,
  onOpenChange,
}: {
  year: AcademicYear | null;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.academic.terms");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const yearId = year?.id ?? "";
  const terms = useTermsQuery(yearId);
  const create = useCreateTermMutation(yearId);
  const update = useUpdateTermMutation(yearId);
  const remove = useDeleteTermMutation(yearId);
  const activate = useActivateTermMutation(yearId);
  const [editing, setEditing] = useState<Term | "new" | null>(null);
  const [draft, setDraft] = useState<TermDraft>(EMPTY_DRAFT);
  const [pendingDelete, setPendingDelete] = useState<Term | null>(null);
  const rows = [...(terms.data?.data ?? [])].sort((a, b) => a.sequence - b.sequence);

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  function open(target: Term | "new") {
    setEditing(target);
    setDraft(
      target === "new"
        ? { ...EMPTY_DRAFT, sequence: String(rows.length + 1) }
        : {
            name: target.name,
            sequence: String(target.sequence),
            starts_on: target.starts_on,
            ends_on: target.ends_on,
          },
    );
  }

  async function save() {
    if (!draft.name.trim() || !draft.starts_on || !draft.ends_on) return;
    try {
      if (editing === "new") {
        const sequence = Number.parseInt(draft.sequence, 10) || rows.length + 1;
        await create.mutateAsync({
          name: draft.name.trim(),
          sequence,
          starts_on: draft.starts_on,
          ends_on: draft.ends_on,
        });
      } else if (editing) {
        await update.mutateAsync({
          id: editing.id,
          body: { name: draft.name.trim(), starts_on: draft.starts_on, ends_on: draft.ends_on },
        });
      }
      toast.success(t("saved"));
      setEditing(null);
    } catch (error) {
      fail(error);
    }
  }

  return (
    <Dialog
      open={year !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent title={t("title", { year: year?.label ?? "" })}>
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus />}
              onClick={() => {
                open("new");
              }}
            >
              {t("add")}
            </Button>
          </div>
          {terms.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : rows.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("empty")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-xs border border-border text-[14px]">
              {rows.map((term) => (
                <li key={term.id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex flex-col">
                    <span className="flex items-center gap-2">
                      {term.name}
                      {term.is_active && <Badge variant="accent">{t("active")}</Badge>}
                    </span>
                    <span className="text-[12px] text-fg-muted">
                      {term.starts_on} - {term.ends_on}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {!term.is_active && (
                      <IconButton
                        icon={<CircleCheck />}
                        aria-label={t("activate")}
                        onClick={() => {
                          activate.mutate(term.id, { onError: fail });
                        }}
                      />
                    )}
                    <IconButton
                      icon={<Pencil />}
                      aria-label={t("edit")}
                      onClick={() => {
                        open(term);
                      }}
                    />
                    <IconButton
                      icon={<Trash2 />}
                      aria-label={t("delete")}
                      onClick={() => {
                        setPendingDelete(term);
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>

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
              <span className="font-medium">{t("form.name")}</span>
              <Input
                value={draft.name}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, name: e.target.value }));
                }}
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">{t("form.startsOn")}</span>
                <Input
                  type="date"
                  value={draft.starts_on}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, starts_on: e.target.value }));
                  }}
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">{t("form.endsOn")}</span>
                <Input
                  type="date"
                  value={draft.ends_on}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, ends_on: e.target.value }));
                  }}
                  required
                />
              </label>
            </div>
            {editing === "new" && (
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">{t("form.sequence")}</span>
                <Input
                  type="number"
                  min={1}
                  value={draft.sequence}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, sequence: e.target.value }));
                  }}
                  className="w-24"
                />
              </label>
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                }}
              >
                {t("form.cancel")}
              </Button>
              <Button type="submit" loading={create.isPending || update.isPending}>
                {t("form.save")}
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
    </Dialog>
  );
}
