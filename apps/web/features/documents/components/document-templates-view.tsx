"use client";

import { ApiError } from "@newsekolah/api-client";
import { formatDate, type Locale } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  EmptyState,
  IconCircle,
  List,
  ListRow,
  RowActionsMenu,
  SectionHeader,
  SkeletonList,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { BadgeCheck, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { SettingsPage } from "../../settings/components/settings-page";
import {
  DOCUMENT_TEMPLATE_KINDS,
  type DocumentTemplate,
  useDocumentTemplatesQuery,
  useSetDefaultDocumentTemplateMutation,
} from "../api";

const NEW_TEMPLATE_HREF = "/settings/document-templates/new";

/**
 * The school's document templates, grouped by the kind of document they
 * print. A row opens the template's editor page; the kind's default is
 * marked, and any other template can be made the default from the row's
 * menu, so a long name keeps the row's width on a phone.
 */
export function DocumentTemplatesView(): ReactElement {
  const t = useTranslations("app.documents.templates");
  const tKind = useTranslations("app.documents.templates.kind");
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_settings");
  const locale = useLocale() as Locale;
  const { me } = useSession();

  const { data, isLoading, isError, error, refetch } = useDocumentTemplatesQuery();
  const setDefault = useSetDefaultDocumentTemplateMutation();

  const templates = data?.data ?? [];
  const groups = DOCUMENT_TEMPLATE_KINDS.map((kind) => ({
    kind,
    templates: templates.filter((template) => template.kind === kind),
  }));
  // Kinds the list does not know yet still show, after the known ones.
  const otherKinds = [...new Set(templates.map((template) => template.kind))].filter(
    (kind) => !DOCUMENT_TEMPLATE_KINDS.includes(kind as (typeof DOCUMENT_TEMPLATE_KINDS)[number]),
  );
  const shown = [
    ...groups,
    ...otherKinds.map((kind) => ({
      kind,
      templates: templates.filter((template) => template.kind === kind),
    })),
  ].filter((group) => group.templates.length > 0);

  function handleSetDefault(template: DocumentTemplate) {
    setDefault.mutate(template.id, {
      onSuccess: () => {
        toast.success(t("defaultUpdated"));
      },
      onError: (err) => {
        toast.error(
          err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
        );
      },
    });
  }

  const addButton = (
    <Button asChild icon={<Plus />}>
      <Link href={NEW_TEMPLATE_HREF}>{t("addTemplate")}</Link>
    </Button>
  );

  return (
    <SettingsPage
      navKey="settings-document-templates"
      description={t("description")}
      primaryAction={canManage && templates.length > 0 ? addButton : undefined}
    >
      {isLoading ? (
        <SkeletonList rows={4} framed />
      ) : isError && !data ? (
        <QueryError retry={() => refetch()} error={error} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<domainIcons.document aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={canManage ? addButton : undefined}
        />
      ) : (
        shown.map((group) => {
          const titleId = `templates-${group.kind}`;
          return (
            <section key={group.kind} aria-labelledby={titleId} className="flex flex-col gap-3">
              <SectionHeader
                titleId={titleId}
                title={tKind.has(group.kind) ? tKind(group.kind) : group.kind}
                count={group.templates.length}
              />
              <List framed>
                {group.templates.map((template) => {
                  const editorHref = `/settings/document-templates/${template.id}`;
                  return (
                    <ListRow
                      key={template.id}
                      leading={
                        <IconCircle tone={template.is_default ? "green" : "neutral"}>
                          <domainIcons.document />
                        </IconCircle>
                      }
                      title={template.name}
                      titleLines={2}
                      meta={t("updatedAt", {
                        date: formatDate(template.updated_at, {
                          locale,
                          timeZone: me?.tenant.timezone,
                        }),
                      })}
                      href={canManage ? editorHref : undefined}
                      trailing={
                        template.is_default ? (
                          <Badge tone="success" size="sm">
                            {t("default")}
                          </Badge>
                        ) : undefined
                      }
                      action={
                        canManage ? (
                          <RowActionsMenu
                            ariaLabel={t("rowActions", { name: template.name })}
                            items={[
                              {
                                label: t("edit"),
                                icon: <Pencil />,
                                onClick: () => {
                                  router.push(editorHref);
                                },
                              },
                              ...(template.is_default
                                ? []
                                : [
                                    {
                                      label: t("setDefault"),
                                      icon: <BadgeCheck />,
                                      disabled: setDefault.isPending,
                                      onClick: () => {
                                        handleSetDefault(template);
                                      },
                                    },
                                  ]),
                            ]}
                          />
                        ) : undefined
                      }
                    />
                  );
                })}
              </List>
            </section>
          );
        })
      )}
    </SettingsPage>
  );
}
