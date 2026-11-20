"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  FilteredEmptyState,
  RowActionsMenu,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  type MentorGroup,
  useDeleteMentorGroupMutation,
  useMentorGroupsQuery,
  useMyMentorGroupsQuery,
} from "../api";

import { GroupSizeLimitPanel } from "./group-size-limit-panel";
import { MentorGroupForm } from "./mentor-group-form";

type MentorGroupRow = MentorGroup & { mentor_name: string };

/**
 * The mentoring groups: the reader's own (/mentoring/my-groups) or every
 * group (/mentoring/groups). Each scope is its own route, so the area's
 * tabs move between them; the group size limit opens from the header.
 */
export function MentorGroupsView({
  initialScope = "mine",
}: {
  initialScope?: "mine" | "all";
}): ReactElement {
  const mine = useTranslations("app.mentoring.myGroups");
  const scope = initialScope;
  const t = useTranslations("app.mentoring.groups");
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_mentor_groups");

  const allGroups = useMentorGroupsQuery(scope === "all");
  const myGroups = useMyMentorGroupsQuery(scope === "mine");
  const { data, isLoading, error, refetch } = scope === "mine" ? myGroups : allGroups;
  const remove = useDeleteMentorGroupMutation();

  const [editing, setEditing] = useState<MentorGroup | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MentorGroup | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const [search, setSearch] = useState("");

  const items = useMemo(() => data?.data ?? [], [data]);
  const teacherMap = useDirectoryNames(items.map((item) => item.mentor_user_id));

  // The searchable name lives in the row data, not in an accessor closing over
  // the lookup: the table caches accessor values per row, so a name that
  // resolves after the rows would otherwise stay unsearchable.
  const tableRows = useMemo<MentorGroupRow[]>(
    () =>
      items.map((item) => ({
        ...item,
        mentor_name: teacherMap.get(item.mentor_user_id)?.name ?? "",
      })),
    [items, teacherMap],
  );

  const columns = useMemo<ColumnDef<MentorGroupRow>[]>(() => {
    const base: ColumnDef<MentorGroupRow>[] = [
      {
        accessorKey: "name",
        header: t("columns.name"),
        enableSorting: false,
        meta: { card: "title", label: t("columns.name") },
      },
      {
        accessorKey: "mentor_name",
        header: t("columns.mentor"),
        enableSorting: false,
        meta: { card: "subtitle", label: t("columns.mentor") },
        cell: ({ row }) => {
          const name = row.original.mentor_name;
          return name ? formatDisplayName(name) : t("unknownMentor");
        },
      },
    ];
    if (!canManage) return base;
    return [
      ...base,
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        meta: { label: t("columns.actions") },
        cell: ({ row }) => {
          const item = row.original;
          return (
            <RowActionsMenu
              ariaLabel={t("columns.actions")}
              items={[
                {
                  label: t("edit"),
                  icon: <Pencil />,
                  onClick: () => {
                    setEditing(item);
                  },
                },
                {
                  label: t("delete"),
                  icon: <Trash2 />,
                  tone: "danger",
                  onClick: () => {
                    setPendingDelete(item);
                  },
                },
              ]}
            />
          );
        },
      },
    ];
  }, [t, canManage]);

  return (
    // No title or eyebrow of its own: the area's header stays put between
    // its tabs, and the current tab names this page.
    <AppPage
      variant="fit"
      primaryAction={
        canManage ? (
          <Button
            icon={<Plus />}
            onClick={() => {
              setEditing("new");
            }}
          >
            {t("add")}
          </Button>
        ) : undefined
      }
      primaryActionCompact={
        canManage
          ? {
              icon: <Plus />,
              label: t("add"),
              onSelect: () => {
                setEditing("new");
              },
            }
          : undefined
      }
      secondaryActions={
        canManage
          ? [
              {
                label: t("limitAction"),
                icon: <UsersRound />,
                onSelect: () => {
                  setLimitOpen(true);
                },
              },
            ]
          : undefined
      }
    >
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/mentoring/components/mentor-groups-view:2"
          mode="local"
          data={tableRows}
          columns={columns}
          rowCount={tableRows.length}
          pagination={{ pageIndex: 0, pageSize: 50 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          // Nothing to search in an empty list; a search that emptied it
          // keeps its box so it can be changed, and so does the first load,
          // which usually brings rows.
          searchable={isLoading || items.length > 0 || search !== ""}
          toolbarLabels={{
            // One's own groups all share one mentor, so only the name is searched.
            searchPlaceholder:
              scope === "mine" ? mine("searchPlaceholder") : t("searchPlaceholder"),
          }}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          getRowId={(item) => item.id}
          onRowActivate={(item) => {
            router.push(`/mentoring/groups/${item.id}`);
          }}
          fillHeight
          emptyState={
            search !== "" ? (
              <FilteredEmptyState
                onReset={() => {
                  setSearch("");
                }}
              />
            ) : (
              <EmptyState
                icon={<domainIcons.mentoring aria-hidden="true" />}
                title={scope === "mine" ? mine("emptyTitle") : t("emptyTitle")}
                description={scope === "mine" ? mine("emptyBody") : t("emptyBody")}
                // The header carries the primary. The empty list of every
                // group repeats it quietly; one's own groups are not made here.
                action={
                  canManage && scope === "all" ? (
                    <Button
                      variant="secondary"
                      icon={<Plus />}
                      onClick={() => {
                        setEditing("new");
                      }}
                    >
                      {t("add")}
                    </Button>
                  ) : undefined
                }
              />
            )
          }
        />
      </div>

      <Dialog open={limitOpen} onOpenChange={setLimitOpen}>
        <DialogContent title={t("tabs.limit")} size="sm">
          {limitOpen && (
            <GroupSizeLimitPanel
              onDone={() => {
                setLimitOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent title={editing === "new" ? t("form.createTitle") : t("form.editTitle")}>
          {editing !== null && (
            <MentorGroupForm
              initial={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deleteTitle")}
        description={pendingDelete ? t("deleteBody", { name: pendingDelete.name }) : ""}
        confirmLabel={t("deleteConfirm")}
        tone="danger"
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success(t("deleted"));
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </AppPage>
  );
}
