"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, ConfirmDialog, Input, Skeleton, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  useCreateWhatsAppTemplateMutation,
  useDeleteWhatsAppTemplateMutation,
  usePreviewWhatsAppTemplateMutation,
  useUpdateWhatsAppTemplateMutation,
  useWhatsAppTemplatesQuery,
  type WhatsAppTemplate,
} from "../api";

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function extractPlaceholders(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER_PATTERN)) {
    found.add(match[1] ?? "");
  }
  return [...found];
}

interface FormState {
  name: string;
  locale: string;
  metaTemplateName: string;
  body: string;
}

const EMPTY_FORM: FormState = { name: "", locale: "id", metaTemplateName: "", body: "" };

export function TemplatesView(): ReactElement {
  const t = useTranslations("app.messaging.templates");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const list = useWhatsAppTemplatesQuery();
  const create = useCreateWhatsAppTemplateMutation();
  const update = useUpdateWhatsAppTemplateMutation();
  const remove = useDeleteWhatsAppTemplateMutation();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppTemplate | null>(null);

  const placeholders = useMemo(() => extractPlaceholders(form.body), [form.body]);

  function startEdit(template: WhatsAppTemplate) {
    setEditingId(template.id);
    setCreating(false);
    setForm({
      name: template.name,
      locale: template.locale,
      metaTemplateName: template.meta_template_name,
      body: template.body,
    });
  }

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function cancelEdit() {
    setCreating(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    const body = {
      name: form.name,
      locale: form.locale,
      meta_template_name: form.metaTemplateName,
      body: form.body,
    };
    try {
      if (editingId) {
        await update.mutateAsync({ templateId: editingId, body });
        toast.success(t("updated"));
      } else {
        await create.mutateAsync(body);
        toast.success(t("created"));
      }
      cancelEdit();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success(t("deleted"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setDeleteTarget(null);
    }
  }

  const templates = list.data?.data ?? [];
  const showForm = creating || editingId !== null;

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
          <p className="text-[13px] text-fg-muted">{t("body")}</p>
        </div>
        {!showForm && <Button onClick={startCreate}>{t("addNew")}</Button>}
      </div>

      {list.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : showForm ? (
        <TemplateForm
          form={form}
          setForm={setForm}
          placeholders={placeholders}
          templateId={editingId}
          onSave={() => void handleSave()}
          onCancel={cancelEdit}
          saving={create.isPending || update.isPending}
        />
      ) : templates.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-fg">{template.name}</p>
                <p className="truncate text-[13px] text-fg-muted">{template.meta_template_name}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    startEdit(template);
                  }}
                >
                  {t("form.save")}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDeleteTarget(template);
                  }}
                >
                  {t("form.delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("confirmDelete")}
        onConfirm={handleDelete}
      />
    </div>
  );
}

interface TemplateFormProps {
  form: FormState;
  setForm: (updater: (f: FormState) => FormState) => void;
  placeholders: string[];
  templateId: string | null;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

function TemplateForm({
  form,
  setForm,
  placeholders,
  templateId,
  onSave,
  onCancel,
  saving,
}: TemplateFormProps): ReactElement {
  const t = useTranslations("app.messaging.templates");
  const preview = usePreviewWhatsAppTemplateMutation();
  const [variables, setVariables] = useState<Record<string, string>>({});

  async function handlePreview() {
    if (!templateId) return;
    await preview.mutateAsync({ templateId, variables });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("form.nameLabel")}</span>
        <Input
          value={form.name}
          onChange={(e) => {
            setForm((f) => ({ ...f, name: e.target.value }));
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("form.localeLabel")}</span>
        <Input
          value={form.locale}
          onChange={(e) => {
            setForm((f) => ({ ...f, locale: e.target.value }));
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("form.metaTemplateNameLabel")}</span>
        <Input
          value={form.metaTemplateName}
          onChange={(e) => {
            setForm((f) => ({ ...f, metaTemplateName: e.target.value }));
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("form.bodyLabel")}</span>
        <Textarea
          rows={4}
          value={form.body}
          onChange={(e) => {
            setForm((f) => ({ ...f, body: e.target.value }));
          }}
        />
        <span className="text-fg-muted">{t("form.bodyHint")}</span>
      </label>

      {placeholders.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xs border border-border bg-bg p-3">
          <p className="text-[13px] font-medium text-fg">{t("form.placeholdersLabel")}</p>
          <div className="flex flex-wrap gap-2 text-[13px]">
            {placeholders.map((name) => (
              <span key={name} className="rounded-xs border border-border bg-surface px-2 py-1">
                {name}
              </span>
            ))}
          </div>

          {templateId && (
            <div className="flex flex-col gap-2 border-t border-border pt-2">
              <p className="text-[13px] font-medium text-fg">{t("preview.title")}</p>
              {placeholders.map((name) => (
                <label key={name} className="flex flex-col gap-1 text-[13px]">
                  <span className="text-fg-muted">
                    {t("preview.variableValueLabel", { variable: name })}
                  </span>
                  <Input
                    value={variables[name] ?? ""}
                    onChange={(e) => {
                      setVariables((v) => ({ ...v, [name]: e.target.value }));
                    }}
                  />
                </label>
              ))}
              <Button
                variant="secondary"
                onClick={() => void handlePreview()}
                disabled={preview.isPending}
              >
                {t("preview.title")}
              </Button>
              {preview.data && (
                <div className="rounded-xs border border-border bg-surface p-2 text-[13px]">
                  {preview.data.missing_variables && preview.data.missing_variables.length > 0 ? (
                    <p className="text-status-absent">
                      {t("preview.missingVariables", {
                        variables: preview.data.missing_variables.join(", "),
                      })}
                    </p>
                  ) : (
                    <p className="whitespace-pre-wrap text-fg">{preview.data.rendered}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={saving}>
          {t("form.save")}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t("form.cancel")}
        </Button>
      </div>
    </div>
  );
}
