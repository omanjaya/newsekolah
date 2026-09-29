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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("columns.name")}</TableHead>
              <TableHead scope="col">{t("columns.kind")}</TableHead>
              <TableHead scope="col">{t("columns.status")}</TableHead>
              <TableHead scope="col">{t("columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.id}>
                <TableCell>{template.name}</TableCell>
                <TableCell className="text-fg-muted">{tKind(template.kind)}</TableCell>
                <TableCell>
                  {template.is_default && <Badge variant="accent">{t("default")}</Badge>}
                </TableCell>
                <TableCell>
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
