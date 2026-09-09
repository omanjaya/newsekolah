"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
  Select,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type Period,
  useCreatePeriodMutation,
  useCreatePeriodTemplateMutation,
  useDeletePeriodMutation,
  usePeriodTemplatesQuery,
  useTemplatePeriodsQuery,
  useUpdatePeriodMutation,
} from "../api";

import { PeriodForm } from "./period-form";
import { WeekPanel } from "./week-panel";

export function PeriodsView(): ReactElement {
  const t = useTranslations("app.school.periods");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const templates = usePeriodTemplatesQuery();
  const [templateId, setTemplateId] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const createTemplate = useCreatePeriodTemplateMutation();
  const list = templates.data?.data ?? [];
  const selected =
    list.find((x) => x.id === templateId) ?? list.find((x) => x.is_default) ?? list[0];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("template")}</span>
          <Select
            options={list.map((x) => ({
              value: x.id,
              label: x.is_default ? `${x.name} (${t("default")})` : x.name,
            }))}
            value={selected?.id ?? ""}
            onValueChange={setTemplateId}
            className="w-64"
            placeholder={t("noTemplate")}
          />
        </label>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTemplate.trim()) return;
            createTemplate.mutate(
              { name: newTemplate.trim(), is_default: list.length === 0 },
              {
                onSuccess: () => {
                  setNewTemplate("");
                  toast.success(t("templateCreated"));
                },
                onError: (error) => {
                  toast.error(
                    error instanceof ApiError
                      ? apiErrorMessage(error.code)
                      : apiErrorMessage("UNKNOWN"),
                  );
                },
              },
            );
          }}
        >
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("newTemplate")}</span>
            <Input
              value={newTemplate}
              onChange={(e) => {
                setNewTemplate(e.target.value);
              }}
              placeholder={t("newTemplatePlaceholder")}
              className="w-56"
            />
          </label>
          <Button type="submit" size="sm" variant="secondary" loading={createTemplate.isPending}>
            {t("addTemplate")}
          </Button>
        </form>
      </div>
      {templates.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : selected ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <PeriodTable templateId={selected.id} />
          <WeekPanel templateId={selected.id} />
        </div>
      ) : (
        <EmptyState
          icon={<domainIcons.schedule aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      )}
    </div>
  );
}

function PeriodTable({ templateId }: { templateId: string }): ReactElement {
  const t = useTranslations("app.school.periods");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const periods = useTemplatePeriodsQuery(templateId);
  const create = useCreatePeriodMutation(templateId);
  const update = useUpdatePeriodMutation();
  const remove = useDeletePeriodMutation();
  const [editing, setEditing] = useState<Period | "new" | null>(null);
  const rows = [...(periods.data?.data ?? [])].sort((a, b) => a.sequence - b.sequence);
  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-medium text-fg">{t("periodsTitle")}</h2>
        <Button
          size="sm"
          icon={<Plus />}
          onClick={() => {
            setEditing("new");
          }}
        >
          {t("addPeriod")}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-sm border border-border bg-surface">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-fg-muted">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">{t("name")}</th>
              <th className="px-3 py-2 font-medium">{t("time")}</th>
              <th className="px-3 py-2 font-medium">{t("kind")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 text-fg-muted">{p.sequence}</td>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2">
                  {p.starts_at.slice(0, 5)}-{p.ends_at.slice(0, 5)}
                </td>
                <td className="px-3 py-2 text-fg-muted">{p.is_break ? t("break") : t("lesson")}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <IconButton
                      icon={<Pencil />}
                      aria-label={t("edit")}
                      onClick={() => {
                        setEditing(p);
                      }}
                    />
                    <IconButton
                      icon={<Trash2 />}
                      aria-label={t("delete")}
                      onClick={() => {
                        remove.mutate(p.id, { onError: fail });
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !periods.isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-fg-muted">
                  {t("noPeriods")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent title={editing === "new" ? t("addPeriod") : t("edit")}>
          {editing !== null && (
            <PeriodForm
              initial={editing === "new" ? undefined : editing}
              nextSequence={(rows[rows.length - 1]?.sequence ?? 0) + 1}
              lastEnd={rows[rows.length - 1]?.ends_at.slice(0, 5) ?? "07:00"}
              pending={create.isPending || update.isPending}
              onSubmit={async (body) => {
                try {
                  if (editing === "new") await create.mutateAsync(body);
                  else await update.mutateAsync({ id: editing.id, body });
                  toast.success(t("saved"));
                  setEditing(null);
                } catch (error) {
                  fail(error);
                }
              }}
              onCancel={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
