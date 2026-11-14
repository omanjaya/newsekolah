"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
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
  SkeletonForm,
  Textarea,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useRef, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { isModuleEnabled } from "../../../lib/modules/feature-modules";
import { useSession } from "../../../lib/session/session-provider";
import { SettingsSaveBar } from "../../settings/components/settings-save-bar";
import {
  KNOWN_TEMPLATE_PLACEHOLDERS,
  availableTemplateKinds,
  type DocumentTemplate,
  type DocumentTemplateKind,
  extractPlaceholders,
  renderPreviewHtml,
  useCreateDocumentTemplateMutation,
  useDocumentTemplatesQuery,
  useUpdateDocumentTemplateMutation,
} from "../api";

const LIST_HREF = "/settings/document-templates";

/** The page frame of the editor: settings hub > templates > this template. */
function EditorPage({
  title,
  floating,
  children,
}: {
  title: string;
  floating?: ReactElement;
  children: ReactElement;
}): ReactElement {
  const t = useTranslations();
  return (
    <AppPage
      variant="default"
      title={title}
      nav={false}
      breadcrumb={[
        { label: t("app.settingsHub.title"), href: "/settings" },
        { label: t("app.documents.templates.navLabel"), href: LIST_HREF },
        { label: title },
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
      <EditorPage title={title}>
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
 * placeholders as buttons that insert at the cursor; on the right a
 * preview rendered in an isolated frame with sample values, kept in view.
 * Create when `template` is undefined, edit otherwise; the kind is fixed
 * once created.
 */
function TemplateEditorForm({ template }: { template?: DocumentTemplate }): ReactElement {
  const t = useTranslations("app.documents.templates.editor");
  const tKind = useTranslations("app.documents.templates.kind");
  const tPlaceholder = useTranslations("app.documents.templates.placeholders");
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

  const placeholders = useMemo(() => extractPlaceholders(body), [body]);
  const knownPlaceholders = KNOWN_TEMPLATE_PLACEHOLDERS[kind] ?? [];
  const previewHtml = useMemo(() => renderPreviewHtml(body, placeholders), [body, placeholders]);
  const saving = create.isPending || update.isPending;
  const dirty = template
    ? name !== template.name || body !== template.body
    : name.trim() !== "" || body.trim() !== "";
  const nameError = submitted && !name.trim() ? t("nameRequired") : undefined;
  const bodyError = submitted && !body.trim() ? t("bodyRequired") : undefined;

  function placeholderLabel(placeholder: string): string {
    return tPlaceholder.has(placeholder) ? tPlaceholder(placeholder) : placeholder;
  }

  /** Puts `{{name}}` where the cursor is (or at the end) and keeps typing there. */
  function insertPlaceholder(placeholder: string) {
    const token = `{{${placeholder}}}`;
    const field = bodyRef.current;
    const start = field?.selectionStart ?? body.length;
    const end = field?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function onError(err: unknown) {
    setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
  }

  function handleSave() {
    setSubmitted(true);
    setError(null);
    if (!name.trim() || !body.trim()) return;
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
                      title={`{{${placeholder}}}`}
                      onClick={() => {
                        insertPlaceholder(placeholder);
                      }}
                    >
                      {placeholderLabel(placeholder)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </FormSection>
        </div>

        <Card className="lg:sticky lg:top-[calc(var(--shell-header-height,3.5rem)+1.5rem)]">
          <CardHeader>
            <CardTitle as="h2">{t("previewLabel")}</CardTitle>
            <CardDescription>{t("previewHint")}</CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-4 px-5 pb-5">
            <div className="rounded-md bg-surface-sunken p-3">
              <iframe
                title={t("previewLabel")}
                sandbox=""
                srcDoc={previewHtml}
                className="aspect-[1/1.2] w-full rounded-xs bg-surface shadow-1"
              />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-label text-fg">{t("placeholdersLabel")}</p>
              {placeholders.length === 0 ? (
                <p className="text-body-sm text-fg-muted">{t("noPlaceholders")}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {placeholders.map((placeholder) => (
                    <Badge
                      key={placeholder}
                      size="sm"
                      tone={knownPlaceholders.includes(placeholder) ? "success" : "warning"}
                      title={`{{${placeholder}}}`}
                    >
                      {placeholderLabel(placeholder)}
                    </Badge>
                  ))}
                </div>
              )}
              {placeholders.some((placeholder) => !knownPlaceholders.includes(placeholder)) && (
                <p className="text-body-sm text-fg-muted">{t("unknownPlaceholdersHint")}</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </EditorPage>
  );
}
