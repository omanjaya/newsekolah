"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Field,
  FormActions,
  IconButton,
  Input,
  List,
  ListRow,
  Select,
  SkeletonList,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { MessageSquareText, Plus } from "lucide-react";
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

/**
 * The languages a Meta message template is commonly approved in, by Meta's
 * language code. The code must match the approved template exactly, so it
 * is chosen from this list rather than typed; a saved template in another
 * language keeps its own code as an extra option.
 */
const TEMPLATE_LOCALES = ["id", "en", "en_US", "en_GB", "ms", "ar"] as const;

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
    <Card>
      <CardHeader
        action={
          showForm ? undefined : (
            // On a phone the labelled button would squeeze the description
            // into a narrow column beside it; there it is an icon button.
            <>
              <IconButton
                variant="primary"
                size="sm"
                icon={<Plus />}
                aria-label={t("addNew")}
                className="sm:hidden"
                onClick={startCreate}
              />
              <Button size="sm" icon={<Plus />} className="max-sm:hidden" onClick={startCreate}>
                {t("addNew")}
              </Button>
            </>
          )
        }
      >
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>

      {list.isLoading ? (
        <div className="px-5 pb-5">
          <SkeletonList rows={3} framed={false} />
        </div>
      ) : showForm ? (
        <div className="px-5 pb-5">
          <TemplateForm
            form={form}
            setForm={setForm}
            placeholders={placeholders}
            templateId={editingId}
            onSave={() => void handleSave()}
            onCancel={cancelEdit}
            saving={create.isPending || update.isPending}
          />
        </div>
      ) : templates.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            variant="compact"
            icon={<MessageSquareText />}
            title={t("empty")}
            action={
              <Button size="sm" variant="secondary" onClick={startCreate}>
                {t("addNew")}
              </Button>
            }
          />
        </div>
      ) : (
        <List>
          {templates.map((template) => (
            <ListRow
              key={template.id}
              title={template.name}
              meta={template.meta_template_name}
              action={
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      startEdit(template);
                    }}
                  >
                    {t("form.edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeleteTarget(template);
                    }}
                  >
                    {t("form.delete")}
                  </Button>
                </div>
              }
            />
          ))}
        </List>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("confirmDelete")}
        description={t("confirmDeleteBody", { name: deleteTarget?.name ?? "" })}
        confirmLabel={t("form.delete")}
        destructive
        onConfirm={handleDelete}
      />
    </Card>
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

  const localeOptions = [
    ...TEMPLATE_LOCALES,
    ...(TEMPLATE_LOCALES.some((code) => code === form.locale) ? [] : [form.locale]),
  ].map((code) => ({
    value: code,
    label: t("form.localeOption", {
      name: (TEMPLATE_LOCALES as readonly string[]).includes(code)
        ? t(`form.locales.${code}`)
        : code,
      code,
    }),
  }));

  return (
    <div className="flex max-w-narrow flex-col gap-3">
      <Field label={t("form.nameLabel")}>
        <Input
          value={form.name}
          onChange={(e) => {
            setForm((f) => ({ ...f, name: e.target.value }));
          }}
        />
      </Field>
      <Field label={t("form.localeLabel")}>
        <Select
          value={form.locale}
          onValueChange={(locale) => {
            setForm((f) => ({ ...f, locale }));
          }}
          options={localeOptions}
        />
      </Field>
      <Field label={t("form.metaTemplateNameLabel")}>
        <Input
          value={form.metaTemplateName}
          onChange={(e) => {
            setForm((f) => ({ ...f, metaTemplateName: e.target.value }));
          }}
        />
      </Field>
      <Field label={t("form.bodyLabel")} hint={t("form.bodyHint")}>
        <Textarea
          rows={4}
          value={form.body}
          onChange={(e) => {
            setForm((f) => ({ ...f, body: e.target.value }));
          }}
        />
      </Field>

      {placeholders.length > 0 && (
        <div className="flex flex-col gap-3 rounded-md bg-surface-sunken p-4">
          <p className="text-label text-fg">{t("form.placeholdersLabel")}</p>
          <div className="flex flex-wrap gap-2">
            {placeholders.map((name) => (
              <Badge key={name} appearance="outline">
                {name}
              </Badge>
            ))}
          </div>

          {templateId && (
            <div className="flex flex-col gap-3 border-t border-line pt-3">
              <p className="text-label text-fg">{t("preview.title")}</p>
              {placeholders.map((name) => (
                <Field key={name} label={t("preview.variableValueLabel", { variable: name })}>
                  <Input
                    value={variables[name] ?? ""}
                    onChange={(e) => {
                      setVariables((v) => ({ ...v, [name]: e.target.value }));
                    }}
                  />
                </Field>
              ))}
              <Button
                variant="secondary"
                onClick={() => void handlePreview()}
                disabled={preview.isPending}
              >
                {t("preview.title")}
              </Button>
              {preview.data && (
                <div className="rounded-md bg-surface p-3 text-body-sm">
                  {preview.data.missing_variables && preview.data.missing_variables.length > 0 ? (
                    <p className="text-danger">
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

      <FormActions>
        <Button variant="secondary" onClick={onCancel}>
          {t("form.cancel")}
        </Button>
        <Button onClick={onSave} loading={saving}>
          {t("form.save")}
        </Button>
      </FormActions>
    </div>
  );
}
