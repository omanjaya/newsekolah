"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  ConfirmDialog,
  DateRangePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  Input,
  List,
  ListRow,
  NumberInput,
  RowActionsMenu,
  SkeletonList,
  useToast,
} from "@newsekolah/ui";
import { CircleCheck, ListTree, Pencil, Plus, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
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
import { formatCalendarDate } from "../lib/format-calendar-date";

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
  const format = useFormatter();
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
  const [pendingActivate, setPendingActivate] = useState<Term | null>(null);
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
      <DialogContent title={t("title", { year: year?.label ?? "" })} size="md">
        <div className="flex flex-col gap-4">
          {terms.isLoading ? (
            <SkeletonList rows={2} framed />
          ) : rows.length === 0 ? (
            <EmptyState
              variant="inline"
              icon={<ListTree aria-hidden="true" />}
              title={t("empty")}
            />
          ) : (
            <List framed>
              {rows.map((term) => (
                <ListRow
                  key={term.id}
                  title={term.name}
                  meta={`${formatCalendarDate(format, term.starts_on)} - ${formatCalendarDate(format, term.ends_on)}`}
                  trailing={
                    term.is_active ? (
                      <Badge tone="success" dot>
                        {t("active")}
                      </Badge>
                    ) : undefined
                  }
                  action={
                    <div className="flex items-center gap-1">
                      {!term.is_active && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<CircleCheck />}
                          onClick={() => {
                            setPendingActivate(term);
                          }}
                        >
                          {t("activate")}
                        </Button>
                      )}
                      <RowActionsMenu
                        ariaLabel={t("rowActions", { name: term.name })}
                        items={[
                          {
                            label: t("edit"),
                            icon: <Pencil />,
                            onClick: () => {
                              open(term);
                            },
                          },
                          {
                            label: t("delete"),
                            icon: <Trash2 />,
                            tone: "danger",
                            onClick: () => {
                              setPendingDelete(term);
                            },
                          },
                        ]}
                      />
                    </div>
                  }
                />
              ))}
            </List>
          )}
          <Button
            variant="secondary"
            icon={<Plus />}
            className="self-start"
            onClick={() => {
              open("new");
            }}
          >
            {t("add")}
          </Button>
        </div>
      </DialogContent>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent title={editing === "new" ? t("add") : t("edit")} size="md">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label={t("form.name")} required>
              <Input
                value={draft.name}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, name: e.target.value }));
                }}
              />
            </Field>
            <Field label={t("form.period")} required>
              <DateRangePicker
                value={draft.starts_on ? { from: draft.starts_on, to: draft.ends_on } : null}
                onChange={(range) => {
                  setDraft((d) => ({ ...d, starts_on: range.from, ends_on: range.to }));
                }}
                min={year?.starts_on}
                max={year?.ends_on}
              />
            </Field>
            {editing === "new" && (
              <Field label={t("form.sequence")} className="sm:w-40">
                <NumberInput
                  min={1}
                  value={draft.sequence ? Number(draft.sequence) : null}
                  onChange={(value) => {
                    setDraft((d) => ({ ...d, sequence: value === null ? "" : String(value) }));
                  }}
                />
              </Field>
            )}
            <DialogFooter>
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
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingActivate !== null}
        onOpenChange={(open) => {
          if (!open) setPendingActivate(null);
        }}
        title={t("activateTitle")}
        description={pendingActivate ? t("activateBody", { name: pendingActivate.name }) : ""}
        confirmLabel={t("activate")}
        confirming={activate.isPending}
        onConfirm={async () => {
          if (!pendingActivate) return;
          try {
            await activate.mutateAsync(pendingActivate.id);
            toast.success(t("activated"));
          } catch (error) {
            fail(error);
          } finally {
            setPendingActivate(null);
          }
        }}
      />

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
    </Dialog>
  );
}
