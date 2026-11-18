"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  FormError,
  FormSection,
  Input,
  Select,
  Skeleton,
  SkeletonForm,
  Textarea,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { isModuleEnabled } from "../../../lib/modules/feature-modules";
import { useSession } from "../../../lib/session/session-provider";
import { PreviewSheet } from "../../settings/components/preview-sheet";
import { SettingsSaveBar } from "../../settings/components/settings-save-bar";
import {
  KNOWN_TEMPLATE_LISTS,
  KNOWN_TEMPLATE_PLACEHOLDERS,
  availableTemplateKinds,
  type DocumentTemplate,
  type DocumentTemplateKind,
  useCreateDocumentTemplateMutation,
  useDocumentTemplatesQuery,
  useUpdateDocumentTemplateMutation,
} from "../api";
import {
  fixLegacyPlaceholders,
  listBlockToken,
  placeholderToken,
  renderPreviewHtml,
  scanTemplate,
} from "../template-syntax";

import { TemplatePreview } from "./template-preview";

const LIST_HREF = "/settings/document-templates";

/** The page frame of the editor: settings hub > templates > this template. */
function EditorPage({
  title,
  floating,
  children,
}: {
  /** A string once the template's name is known; a placeholder while it loads. */
  title: ReactNode;
  floating?: ReactElement;
  children: ReactElement;
}): ReactElement {
  const t = useTranslations();
  return (
    <AppPage
      variant="default"
      title={title}
      documentTitle={
        typeof title === "string" ? title : t("app.documents.templates.editor.editTitle")
      }
      nav={false}
      breadcrumb={[
        { label: t("app.settingsHub.title"), href: "/settings" },
        { label: t("app.documents.templates.navLabel"), href: LIST_HREF },
        ...(typeof title === "string" ? [{ label: title }] : []),
      ]}
      floating={floating}
    >
      {children}
    </AppPage>
  );
}

/**
 * The editor page of one document template (`templateId`), or of a new
 * one. The template comes from the cached list: the API has no read for
 * a single template.
 */
export function TemplateEditorView({ templateId }: { templateId?: string }): ReactElement {
  const t = useTranslations("app.documents.templates");
  const query = useDocumentTemplatesQuery();
  const template = templateId
    ? query.data?.data.find((candidate) => candidate.id === templateId)
    : undefined;
  const title = templateId ? (template?.name ?? t("editor.editTitle")) : t("editor.createTitle");

  if (templateId && query.isError && !query.data) {
    return (
      <EditorPage title={title}>
        <QueryError retry={() => query.refetch()} error={query.error} />
      </EditorPage>
    );
  }
  if (templateId && query.isLoading) {
    return (
      <EditorPage title={<Skeleton className="h-8 w-56" />}>
        <div aria-busy="true" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <SkeletonForm fields={4} actions={false} />
          <SkeletonForm fields={2} actions={false} className="hidden lg:flex" />
        </div>
      </EditorPage>
    );
  }
  if (templateId && !template) {
    return (
      <EditorPage title={title}>
        <EmptyState
          icon={<domainIcons.document aria-hidden="true" />}
          title={t("editor.notFoundTitle")}
          description={t("editor.notFoundBody")}
          action={
            <Button asChild variant="secondary">
              <Link href={LIST_HREF}>{t("editor.backToList")}</Link>
            </Button>
          }
        />
      </EditorPage>
    );
  }
  return <TemplateEditorForm key={template?.id ?? "new"} template={template} />;
}

/**
 * Two panes: name, kind and the HTML body on the left, with the kind's
 * values as buttons that insert `{{.name}}` at the cursor; on the right a
 * preview rendered in an isolated frame, each value shown as its name in
 * square brackets, kept in view. Below `lg` the preview opens in a bottom
 * sheet from the body card instead. Create when `template` is undefined,
 * edit otherwise; the kind is fixed once created.
 *
 * The first editor wrote values without their dot (`{{name}}`), which the
 * API cannot parse, so every document issued from such a body fails. A
 * body like that loads as it was saved, flagged above the field with a
 * button that adds the dots, and cannot be saved again until it is fixed.
 */
function TemplateEditorForm({ template }: { template?: DocumentTemplate }): ReactElement {
  const t = useTranslations("app.documents.templates.editor");
  const tKind = useTranslations("app.documents.templates.kind");
  const tTemplates = useTranslations("app.documents.templates");
  const toast = useToast();
  const router = useRouter();
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateDocumentTemplateMutation();
  const update = useUpdateDocumentTemplateMutation();
  const { me } = useSession();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // A new template is offered only the kinds whose module is on; an
  // existing one keeps its own kind (the list never holds a switched-off one).
  const kinds = template
    ? [template.kind as DocumentTemplateKind]
    : availableTemplateKinds((module) => isModuleEnabled(me, module));

  const [kind, setKind] = useState<DocumentTemplateKind>(
    (template?.kind ?? kinds[0] ?? "class_journal") as DocumentTemplateKind,
  );
  const [name, setName] = useState(template?.name ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { placeholders, legacy } = useMemo(() => scanTemplate(body), [body]);
  const knownPlaceholders = KNOWN_TEMPLATE_PLACEHOLDERS[kind] ?? [];
  const knownLists = KNOWN_TEMPLATE_LISTS[kind] ?? {};
  const isKnown = (placeholder: string) =>
    knownPlaceholders.includes(placeholder) || Object.hasOwn(knownLists, placeholder);
  const saving = create.isPending || update.isPending;
  const dirty = template
    ? name !== template.name || body !== template.body
    : name.trim() !== "" || body.trim() !== "";
  const nameError = submitted && !name.trim() ? t("nameRequired") : undefined;
  let bodyError: string | undefined;
  if (submitted && !body.trim()) bodyError = t("bodyRequired");
  else if (submitted && legacy.length > 0) bodyError = t("legacyError");

  /**
   * A value's name for a person: "Nama siswa" for `student_name`, the
   * field of an item when `list` names its list, the kind's own wording
   * where it differs, and the raw name for a value the catalog lacks.
   */
  function placeholderLabel(placeholder: string, list: string | null = null): string {
    const key = [
      ...(list ? [`placeholderItems.${list}.${placeholder}`] : []),
      `kindPlaceholders.${kind}.${placeholder}`,
      `placeholders.${placeholder}`,
    ].find((candidate) => tTemplates.has(candidate));
    return key ? tTemplates(key) : placeholder;
  }

  /** Puts `token` where the cursor is (or at the end) and keeps typing after it. */
  function insertToken(token: string) {
    const field = bodyRef.current;
    const start = field?.selectionStart ?? body.length;
    const end = field?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function fixLegacy() {
    setBody(fixLegacyPlaceholders(body));
  }

  function onError(err: unknown) {
    setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
  }

  function handleSave() {
    setSubmitted(true);
    setError(null);
    if (!name.trim() || !body.trim() || legacy.length > 0) return;
    const done = (message: string) => {
      toast.success(message);
      router.push(LIST_HREF);
    };
    if (template) {
      update.mutate(
        { templateId: template.id, name, body, variables: placeholders },
        {
          onSuccess: () => {
            done(t("saved"));
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
          done(t("created"));
        },
        onError,
      },
    );
  }

  // The preview frame and the values in use: the trailing card from `lg`
  // up; below it, a sheet the body card opens, so a phone need not scroll
  // past the whole body to check an edit.
  const preview = (
    <TemplatePreview
      html={renderPreviewHtml(body, placeholderLabel)}
      placeholders={placeholders}
      legacy={legacy}
      isKnown={isKnown}
      label={placeholderLabel}
    />
  );

  return (
    <EditorPage
      title={template ? template.name : t("createTitle")}
      floating={
        <SettingsSaveBar
          container="default"
          dirty={dirty}
          saving={saving}
          onSave={handleSave}
          saveLabel={template ? t("save") : t("create")}
          onDiscard={() => {
            setName(template?.name ?? "");
            setBody(template?.body ?? "");
            setSubmitted(false);
            setError(null);
          }}
        />
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {error && <FormError>{error}</FormError>}
          <FormSection variant="card" title={t("detailsTitle")}>
            <Field label={t("nameLabel")} required error={nameError}>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                maxLength={150}
              />
            </Field>
            <Field
              label={t("kindLabel")}
              hint={template ? t("kindFixedHint") : undefined}
              disabled={Boolean(template)}
            >
              <Select
                value={kind}
                onValueChange={(value) => {
                  setKind(value as DocumentTemplateKind);
                }}
                options={kinds.map((value) => ({ value, label: tKind(value) }))}
              />
            </Field>
          </FormSection>

          <FormSection
            variant="card"
            columns={1}
            title={t("bodyTitle")}
            description={t("bodyHint")}
          >
            {/* The first thing in the card, not the section's aside: beside
                the title it squeezed the hint into a narrow column on a
                phone. */}
            <PreviewSheet label={t("previewLabel")}>
              <div className="flex flex-col gap-4">
                <p className="text-body-sm text-fg-muted">{t("previewHint")}</p>
                {preview}
              </div>
            </PreviewSheet>
            {legacy.length > 0 && (
              <Alert
                tone="warning"
                title={t("legacyTitle")}
                action={
                  <Button variant="secondary" size="sm" onClick={fixLegacy}>
                    {t("legacyFix")}
                  </Button>
                }
              >
                {t("legacyBody", {
                  legacy: `{{${legacy[0] ?? ""}}}`,
                  fixed: placeholderToken(legacy[0] ?? ""),
                })}
              </Alert>
            )}
            <Field label={t("bodyLabel")} required error={bodyError}>
              <Textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                }}
                rows={18}
                spellCheck={false}
                className="text-body-sm font-mono"
              />
            </Field>
            <div className="flex flex-col gap-2">
              <p className="text-label text-fg">{t("insertLabel")}</p>
              {knownPlaceholders.length === 0 ? (
                <p className="text-body-sm text-fg-muted">{t("knownPlaceholdersEmpty")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {knownPlaceholders.map((placeholder) => (
                    <Button
                      key={placeholder}
                      variant="secondary"
                      size="sm"
                      icon={<Plus />}
                      title={placeholderToken(placeholder)}
                      onClick={() => {
                        insertToken(placeholderToken(placeholder));
                      }}
                    >
                      {placeholderLabel(placeholder)}
                    </Button>
                  ))}
                  {Object.entries(knownLists).map(([list, fields]) => (
                    <Button
                      key={list}
                      variant="secondary"
                      size="sm"
                      icon={<Plus />}
                      title={`{{range .${list}}}`}
                      onClick={() => {
                        insertToken(listBlockToken(list, fields));
                      }}
                    >
                      {placeholderLabel(list)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </FormSection>
        </div>

        <Card className="hidden lg:sticky lg:top-[calc(var(--shell-header-height,3.5rem)+1.5rem)] lg:block">
          <CardHeader>
            <CardTitle as="h2">{t("previewLabel")}</CardTitle>
            <CardDescription>{t("previewHint")}</CardDescription>
          </CardHeader>
          <div className="px-5 pb-5">{preview}</div>
        </Card>
      </div>
    </EditorPage>
  );
}
