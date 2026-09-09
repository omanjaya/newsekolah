"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Select,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession, useCan } from "../../../lib/session/session-provider";
import {
  type Announcement,
  type AnnouncementStatus,
  useAnnouncementTransitionMutation,
  useAnnouncementsQuery,
  useDeleteAnnouncementMutation,
} from "../api";

import { AnnouncementForm } from "./announcement-form";

type Audience = components["schemas"]["Audience"];

const STATUS_VARIANT: Record<AnnouncementStatus, "neutral" | "accent"> = {
  draft: "neutral",
  scheduled: "accent",
  published: "accent",
  archived: "neutral",
};

export function AnnouncementsManage(): ReactElement {
  const t = useTranslations("app.announcements");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const canCreate = useCan("create_announcements");
  const canEdit = useCan("edit_announcements");
  const canPublish = useCan("publish_announcements");
  const canDelete = useCan("delete_announcements");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [status, setStatus] = useState<AnnouncementStatus | "">("");
  const [cursors, setCursors] = useState<string[]>([""]);
  const cursor = cursors[cursors.length - 1] ?? "";
  const { data, isLoading } = useAnnouncementsQuery(status, cursor);
  const transition = useAnnouncementTransitionMutation();
  const remove = useDeleteAnnouncementMutation();

  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Announcement | null>(null);
  const [pendingPublish, setPendingPublish] = useState<Announcement | null>(null);

  const items = data?.data ?? [];
  const timeZone = me?.tenant.timezone;

  function fail(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  async function run(action: "publish" | "schedule" | "archive", a: Announcement) {
    try {
      await transition.mutateAsync({ id: a.id, action });
      toast.success(t(`actions.${action}Done`));
    } catch (error) {
      fail(error);
    }
  }

  function describeAudience(audience: Audience): string {
    switch (audience.type) {
      case "all":
        return t("form.audienceAll");
      case "roles":
        return (audience.role_slugs ?? []).map((slug) => t(`roles.${slug}`)).join(", ");
      case "classes":
        return t("audienceClassCount", { count: audience.class_ids?.length ?? 0 });
      case "users":
        return t("audienceUserCount", { count: audience.user_ids?.length ?? 0 });
    }
  }

  const columns = useMemo<ColumnDef<Announcement>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("columns.title"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-fg">{row.original.title}</span>
            <span className="text-[12px] text-fg-muted">
              {describeAudience(row.original.audience)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>
            {t(`status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: "when",
        header: t("columns.when"),
        enableSorting: false,
        cell: ({ row }) => {
          const a = row.original;
          const when = a.published_at ?? a.starts_at ?? a.created_at;
          return formatDateTime(when, { locale, timeZone });
        },
      },
      {
        id: "reach",
        header: t("columns.reach"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status === "published" || row.original.status === "archived"
            ? t("reach", {
                read: row.original.read_count ?? 0,
                total: row.original.recipient_count,
              })
            : "-",
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => {
          const a = row.original;
          const editable = a.status === "draft" || a.status === "scheduled";
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton icon={<MoreHorizontal />} aria-label={t("actions.menu")} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && editable && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditing(a);
                    }}
                  >
                    {t("actions.edit")}
                  </DropdownMenuItem>
                )}
                {canPublish && editable && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setPendingPublish(a);
                    }}
                  >
                    {t("actions.publish")}
                  </DropdownMenuItem>
                )}
                {canPublish && a.status === "draft" && a.starts_at && (
                  <DropdownMenuItem onSelect={() => void run("schedule", a)}>
                    {t("actions.schedule")}
                  </DropdownMenuItem>
                )}
                {canPublish && (a.status === "published" || a.status === "scheduled") && (
                  <DropdownMenuItem onSelect={() => void run("archive", a)}>
                    {t("actions.archive")}
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem
                    onSelect={() => {
                      setPendingDelete(a);
                    }}
                  >
                    {t("actions.delete")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- describeAudience closes over t only
    [t, locale, timeZone, canEdit, canPublish, canDelete],
  );

  const statusOptions = [
    { value: "all", label: t("status.all") },
    { value: "draft", label: t("status.draft") },
    { value: "scheduled", label: t("status.scheduled") },
    { value: "published", label: t("status.published") },
    { value: "archived", label: t("status.archived") },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select
          options={statusOptions}
          value={status || "all"}
          onValueChange={(value) => {
            setStatus(value === "all" ? "" : (value as AnnouncementStatus));
            setCursors([""]);
          }}
          aria-label={t("columns.status")}
          className="w-48"
        />
        {canCreate && (
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setEditing("new");
            }}
          >
            {t("actions.create")}
          </Button>
        )}
      </div>

      <DataTable
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 20 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        isLoading={isLoading}
        getRowId={(a) => a.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.announcement aria-hidden="true" />}
            title={t("manageEmptyTitle")}
            description={t("manageEmptyBody")}
          />
        }
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={cursors.length <= 1}
          onClick={() => {
            setCursors((prev) => prev.slice(0, -1));
          }}
        >
          {t("pagePrev")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!data?.page.next_cursor}
          onClick={() => {
            if (data?.page.next_cursor) setCursors((prev) => [...prev, data.page.next_cursor]);
          }}
        >
          {t("pageNext")}
        </Button>
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent
          title={editing === "new" ? t("form.createTitle") : t("form.editTitle")}
          className="max-w-2xl"
        >
          {editing !== null && (
            <AnnouncementForm
              initial={editing === "new" ? undefined : editing}
              onSaved={() => {
                setEditing(null);
              }}
              onCancel={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingPublish !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPublish(null);
        }}
        title={t("actions.publishConfirmTitle")}
        description={
          pendingPublish
            ? t("actions.publishConfirmBody", {
                title: pendingPublish.title,
                audience: describeAudience(pendingPublish.audience),
              })
            : ""
        }
        confirmLabel={t("actions.publish")}
        confirming={transition.isPending}
        onConfirm={async () => {
          if (!pendingPublish) return;
          await run("publish", pendingPublish);
          setPendingPublish(null);
        }}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("actions.deleteConfirmTitle")}
        description={
          pendingDelete ? t("actions.deleteConfirmBody", { title: pendingDelete.title }) : ""
        }
        confirmLabel={t("actions.delete")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success(t("actions.deleteDone"));
          } catch (error) {
            fail(error);
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </div>
  );
}
