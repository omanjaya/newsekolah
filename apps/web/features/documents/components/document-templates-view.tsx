"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type DocumentTemplate,
  useDocumentTemplatesQuery,
  useSetDefaultDocumentTemplateMutation,
} from "../api";

import { TemplateEditor } from "./template-editor";

export function DocumentTemplatesView(): ReactElement {
  const t = useTranslations("app.documents.templates");
  const tKind = useTranslations("app.documents.templates.kind");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_settings");

  const { data, isLoading } = useDocumentTemplatesQuery();
  const setDefault = useSetDefaultDocumentTemplateMutation();
  const [editing, setEditing] = useState<DocumentTemplate | "new" | null>(null);

  const templates = data?.data ?? [];

  function handleSetDefault(templateId: string) {
    setDefault.mutate(templateId, {
      onSuccess: () => {
        toast.success(t("defaultUpdated"));
      },
      onError: (error) => {
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        );
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canManage && (
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                setEditing("new");
              }}
            >
              {t("addTemplate")}
            </Button>
          )
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<domainIcons.document aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border bg-surface">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="bg-bg text-left text-fg-muted">
                <th scope="col" className="border-b border-border px-3 py-2 font-medium">
                  {t("columns.name")}
                </th>
                <th scope="col" className="border-b border-border px-3 py-2 font-medium">
                  {t("columns.kind")}
                </th>
                <th scope="col" className="border-b border-border px-3 py-2 font-medium">
                  {t("columns.status")}
                </th>
                <th scope="col" className="border-b border-border px-3 py-2 font-medium">
                  {t("columns.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {templates.map((template) => (
                <tr key={template.id}>
                  <td className="px-3 py-2 text-fg">{template.name}</td>
                  <td className="px-3 py-2 text-fg-muted">{tKind(template.kind)}</td>
                  <td className="px-3 py-2">
                    {template.is_default && <Badge variant="accent">{t("default")}</Badge>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      {canManage && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditing(template);
                          }}
                        >
                          {t("edit")}
                        </Button>
                      )}
                      {canManage && !template.is_default && (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={setDefault.isPending}
                          onClick={() => {
                            handleSetDefault(template.id);
                          }}
                        >
                          {t("setDefault")}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent
          title={editing === "new" ? t("editor.createTitle") : t("editor.editTitle")}
          className="max-w-3xl"
        >
          {editing !== null && (
            <TemplateEditor
              template={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
