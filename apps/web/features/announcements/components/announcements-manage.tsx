"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import {
  Badge,
  type BadgeTone,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  FilteredEmptyState,
  RowActionsMenu,
  type RowActionsMenuItem,
  domainIcons,
  useToast,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, CalendarClock, Pencil, Send, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession, useCan } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import {
  type Announcement,
  type AnnouncementStatus,
  useAnnouncementTransitionMutation,
  useAnnouncementsQuery,
  useDeleteAnnouncementMutation,
} from "../api";
import { describeAudience } from "../lib/describe-audience";
import { isMissedSchedule } from "../lib/missed-schedule";

import { AnnouncementForm } from "./announcement-form";

/** Each status in its own semantic tone, so a scheduled item never reads as a published one. */
const STATUS_TONE: Record<AnnouncementStatus, BadgeTone> = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  archived: "neutral",
};

const STATUSES: AnnouncementStatus[] = ["draft", "scheduled", "published", "archived"];
const STATUS_VALUES = ["", ...STATUSES] as const;

/**
 * `creating`/`onCreatingChange` mirror `MyLeaveRequests`'s own props: the
 * primary "Buat pengumuman" action lives in the shared page header
 * (`AnnouncementsView`), not here, so opening the blank editor is driven
 * from outside while editing an existing row stays this component's own
 * business.
 */
export function AnnouncementsManage({
  creating,
  onCreatingChange,
}: {
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.announcements");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const canCreate = useCan("create_announcements");
  const canEdit = useCan("edit_announcements");
  const canPublish = useCan("publish_announcements");
  const canDelete = useCan("delete_announcements");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const [status, setStatus] = useUrlState<(typeof STATUS_VALUES)[number]>(
    "status",
    STATUS_VALUES,
    "",
  );
  const [cursors, setCursors] = useState<string[]>([""]);
  const cursor = cursors[cursors.length - 1] ?? "";
  const { data, isLoading, isError, error, refetch } = useAnnouncementsQuery(status, cursor);
  const transition = useAnnouncementTransitionMutation();
  const remove = useDeleteAnnouncementMutation();

  const [editingExisting, setEditingExisting] = useState<Announcement | null>(null);
  const editing = creating ? "new" : editingExisting;
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

  const columns = useMemo<ColumnDef<Announcement>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("columns.title"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-fg">{row.original.title}</span>
            <span className="text-caption text-fg-muted">
              {describeAudience(row.original.audience, t)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              tone={STATUS_TONE[row.original.status]}
              appearance={row.original.status === "archived" ? "outline" : "soft"}
            >
              {t(`status.${row.original.status}`)}
            </Badge>
            {isMissedSchedule(row.original, businessNow()) && (
              <Badge tone="warning" title={t("missedSchedule.hint")}>
                {t("missedSchedule.label")}
              </Badge>
            )}
          </div>
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
        // The admin list always carries read_count; a row without one is
        // unknown, not unread, so it shows "-" rather than a false 0.
        cell: ({ row }) =>
          (row.original.status === "published" || row.original.status === "archived") &&
          row.original.read_count !== undefined
            ? t("reach", {
                read: row.original.read_count,
                total: row.original.recipient_count,
              })
            : "-",
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => {
          const a = row.original;
          const editable = a.status === "draft" || a.status === "scheduled";
          const items: RowActionsMenuItem[] = [];
          if (canEdit && editable) {
            items.push({
              label: t("actions.edit"),
              icon: <Pencil />,
              onClick: () => {
                setEditingExisting(a);
              },
            });
          }
          if (canPublish && editable) {
            items.push({
              label: t("actions.publish"),
              icon: <Send />,
              onClick: () => {
                setPendingPublish(a);
              },
            });
          }
          // A missed start must be moved (edit) before scheduling again.
          if (
            canPublish &&
            a.status === "draft" &&
            a.starts_at &&
            !isMissedSchedule(a, businessNow())
          ) {
            items.push({
              label: t("actions.schedule"),
              icon: <CalendarClock />,
              onClick: () => void run("schedule", a),
            });
          }
          if (canPublish && (a.status === "published" || a.status === "scheduled")) {
            items.push({
              label: t("actions.archive"),
              icon: <Archive />,
              onClick: () => void run("archive", a),
            });
          }
          if (canDelete) {
            items.push({
              label: t("actions.delete"),
              icon: <Trash2 />,
              tone: "danger",
              onClick: () => {
                setPendingDelete(a);
              },
            });
          }
          if (items.length === 0) return null;
          return (
            <RowActionsMenu ariaLabel={t("actions.menuFor", { title: a.title })} items={items} />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- describeAudience closes over t only
    [t, locale, timeZone, canEdit, canPublish, canDelete],
  );

  const filters: DataTableFilterDef[] = [
    {
      id: "status",
      label: t("columns.status"),
      value: status,
      onChange: (value) => {
        setStatus(value as (typeof STATUS_VALUES)[number]);
        setCursors([""]);
      },
      options: STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        stateKey="features/announcements/components/announcements-manage:1"
        mode="cursor"
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 20 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        filters={filters}
        isLoading={isLoading}
        error={isError ? error : undefined}
        onRetry={() => void refetch()}
        cursorPagination={{
          hasPrevious: cursors.length > 1,
          hasNext: Boolean(data?.page.next_cursor),
          onPrevious: () => {
            setCursors((prev) => prev.slice(0, -1));
          },
          onNext: () => {
            if (data?.page.next_cursor) setCursors((prev) => [...prev, data.page.next_cursor]);
          },
          page: cursors.length,
          pageSize: 20,
        }}
        getRowId={(a) => a.id}
        emptyState={
          status ? (
            <FilteredEmptyState
              searchable={false}
              onReset={() => {
                setStatus("");
                setCursors([""]);
              }}
            />
          ) : (
            // A publisher who cannot draft (the principal) waits for what
            // teachers and staff write, so the copy does not ask them to.
            <EmptyState
              icon={<domainIcons.announcement aria-hidden="true" />}
              title={canCreate ? t("manageEmptyTitle") : t("publishEmptyTitle")}
              description={canCreate ? t("manageEmptyBody") : t("publishEmptyBody")}
            />
          )
        }
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            onCreatingChange(false);
            setEditingExisting(null);
          }
        }}
      >
        <DialogContent
          title={editing === "new" ? t("form.createTitle") : t("form.editTitle")}
          size="lg"
        >
          {editing !== null && (
            <AnnouncementForm
              initial={editing === "new" ? undefined : editing}
              onSaved={() => {
                onCreatingChange(false);
                setEditingExisting(null);
              }}
              onCancel={() => {
                onCreatingChange(false);
                setEditingExisting(null);
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
                audience: describeAudience(pendingPublish.audience, t),
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
