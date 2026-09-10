"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  DOCUMENT_TEMPLATE_KINDS,
  KNOWN_TEMPLATE_PLACEHOLDERS,
  type DocumentTemplate,
  type DocumentTemplateKind,
  extractPlaceholders,
  renderPreviewHtml,
  useCreateDocumentTemplateMutation,
  useUpdateDocumentTemplateMutation,
} from "../api";

/** Create when `template` is undefined, edit otherwise; kind is fixed once created. */
export function TemplateEditor({
  template,
  onDone,
}: {
  template?: DocumentTemplate;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.documents.templates.editor");
  const tKind = useTranslations("app.documents.templates.kind");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateDocumentTemplateMutation();
  const update = useUpdateDocumentTemplateMutation();

  const [kind, setKind] = useState<DocumentTemplateKind>(
    (template?.kind ?? "leave_letter") as DocumentTemplateKind,
  );
  const [name, setName] = useState(template?.name ?? "");
  const [body, setBody] = useState(template?.body ?? "");

  const placeholders = useMemo(() => extractPlaceholders(body), [body]);
  const knownPlaceholders = KNOWN_TEMPLATE_PLACEHOLDERS[kind] ?? [];
  const previewHtml = useMemo(() => renderPreviewHtml(body, placeholders), [body, placeholders]);
  const saving = create.isPending || update.isPending;

  function onError(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  function handleSave() {
    if (template) {
      update.mutate(
        { templateId: template.id, name, body, variables: placeholders },
        {
          onSuccess: () => {
            toast.success(t("saved"));
            onDone();
          },
          onError,
        },
      );
      return;
    }
    create.mutate(
      { kind, name, engine: "html", body, variables: placeholders, is_default: false },
      {
        onSuccess: () => {
          toast.success(t("created"));
          onDone();
        },
        onError,
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("nameLabel")}</span>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            required
            maxLength={150}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("kindLabel")}</span>
          <Select
            value={kind}
            onValueChange={(value) => {
              setKind(value as DocumentTemplateKind);
            }}
            disabled={Boolean(template)}
            options={DOCUMENT_TEMPLATE_KINDS.map((value) => ({ value, label: tKind(value) }))}
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("bodyLabel")}</span>
          <Textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
            }}
            rows={14}
            className="font-mono text-[12px]"
            required
          />
          <span className="text-fg-muted">{t("bodyHint")}</span>
        </label>

        <div className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("previewLabel")}</span>
          <iframe
            title={t("previewLabel")}
            sandbox=""
            srcDoc={previewHtml}
            className="h-[280px] w-full rounded-xs border border-border bg-surface"
          />
          <span className="text-fg-muted">{t("previewHint")}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PlaceholderList
          label={t("placeholdersLabel")}
          empty={t("noPlaceholders")}
          names={placeholders}
        />
        <PlaceholderList
          label={t("knownPlaceholdersLabel")}
          empty={t("knownPlaceholdersEmpty")}
          names={knownPlaceholders}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} loading={saving} disabled={!name.trim() || !body.trim()}>
          {t("save")}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

function PlaceholderList({
  label,
  empty,
  names,
}: {
  label: string;
  empty: string;
  names: string[];
}): ReactElement {
  return (
    <div className="flex flex-col gap-2 rounded-xs border border-border bg-bg p-3 text-[13px]">
      <p className="font-medium text-fg">{label}</p>
      {names.length === 0 ? (
        <p className="text-fg-muted">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {names.map((name) => (
            <span
              key={name}
              className="rounded-xs border border-border bg-surface px-2 py-1 font-mono text-[12px]"
            >
              {`{{${name}}}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
