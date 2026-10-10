"use client";

import { ApiError } from "@newsekolah/api-client";
import {
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
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryNames } from "../../reference/directory-names";
import { ActivitiesWorkspaceNav } from "../../student-services/components/service-workspace-nav";
import {
  type MentorGroup,
  useDeleteMentorGroupMutation,
  useMentorGroupsQuery,
  useMyMentorGroupsQuery,
} from "../api";

import { GroupSizeLimitPanel } from "./group-size-limit-panel";
import { MentorGroupForm } from "./mentor-group-form";

export function MentorGroupsView({
  initialScope = "mine",
}: {
  initialScope?: "mine" | "all";
}): ReactElement {
  const workspace = useTranslations("app.serviceWorkspace");
  const shell = useTranslations("app.workspace");
  const mine = useTranslations("app.mentoring.myGroups");
  const [scope, setScope] = useUrlState<string>("scope", ["mine", "all"], initialScope);
  const t = useTranslations("app.mentoring.groups");
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_mentor_groups");

  const allGroups = useMentorGroupsQuery(scope === "all");
  const myGroups = useMyMentorGroupsQuery(scope === "mine");
  const { data, isLoading, isError, refetch } = scope === "mine" ? myGroups : allGroups;
  const remove = useDeleteMentorGroupMutation();

  const [tab, setTab] = useUrlState<string>(
    "tab",
    canManage ? ["groups", "limit"] : ["groups"],
    "groups",
  );
  const [editing, setEditing] = useState<MentorGroup | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MentorGroup | null>(null);

  const items = data?.data ?? [];
  const teacherMap = useDirectoryNames(items.map((item) => item.mentor_user_id));

  const columns = useMemo<ColumnDef<MentorGroup>[]>(() => {
    const base: ColumnDef<MentorGroup>[] = [
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      {
        id: "mentor",
        header: t("columns.mentor"),
        enableSorting: false,
        cell: ({ row }) => {
          const name = teacherMap.get(row.original.mentor_user_id)?.name;
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
        cell: ({ row }) => {
          const item = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  icon={<MoreHorizontal />}
                  aria-label={t("columns.actions")}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(item);
                  }}
                >
                  {t("edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setPendingDelete(item);
                  }}
                >
                  {t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ];
  }, [t, teacherMap, canManage]);

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the active tab's panel scrolls internally.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <ActivitiesWorkspaceNav />
      <PageHeader
        eyebrow={t("eyebrow")}
        title={shell("studentActivities")}
        actions={
          canManage &&
          tab === "groups" && (
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                setEditing("new");
              }}
            >
              {t("add")}
            </Button>
          )
        }
      />

      {isError && <QueryError retry={() => refetch()} />}
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col md:min-h-0 md:flex-1">
        {canManage && (
          <TabsList>
            <TabsTrigger value="groups">{t("tabs.groups")}</TabsTrigger>
            <TabsTrigger value="limit">{t("tabs.limit")}</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="groups" className="pt-4 md:min-h-0 md:flex-1">
          <div className="flex flex-col gap-3 md:h-full md:min-h-0">
            {/*
              `scope` picks between two different endpoints (the caller's own
              groups vs. every group), not an optional list filter -- there is
              no "unset" state, so it stays its own required control rather
              than a `DataTableFilters` pill, but as a pill-style `Tabs`
              (matching `CounselingView`'s mine/bkTeam switch) positioned
              directly above the table, next to the search box its toolbar
              renders (see docs/analysis/table-filters-audit-2026-09-30.md).
            */}
            <Tabs value={scope} onValueChange={setScope} aria-label={workspace("groupScope")}>
              <TabsList>
                <TabsTrigger value="mine">{workspace("mine")}</TabsTrigger>
                <TabsTrigger value="all">{workspace("allGroups")}</TabsTrigger>
              </TabsList>
            </Tabs>
            <DataTable
              stateKey="features/mentoring/components/mentor-groups-view:1"
              mode="local"
              data={items}
              columns={columns}
              rowCount={items.length}
              pagination={{ pageIndex: 0, pageSize: 50 }}
              onPaginationChange={() => undefined}
              sorting={[]}
              onSortingChange={() => undefined}
              globalFilter=""
              isLoading={isLoading}
              getRowId={(item) => item.id}
              onRowActivate={(item) => {
                router.push(`/mentoring/groups/${item.id}`);
              }}
              fillHeight
              emptyState={
                <EmptyState
                  icon={<domainIcons.mentoring aria-hidden="true" />}
                  title={scope === "mine" ? mine("emptyTitle") : t("emptyTitle")}
                  description={scope === "mine" ? mine("emptyBody") : t("emptyBody")}
                  action={
                    canManage && (
                      <Button
                        size="sm"
                        icon={<Plus />}
                        onClick={() => {
                          setEditing("new");
                        }}
                      >
                        {t("add")}
                      </Button>
                    )
                  }
                />
              }
            />
          </div>
        </TabsContent>
        {canManage && (
          <TabsContent value="limit" className="pt-4 md:min-h-0 md:flex-1 md:overflow-y-auto">
            <GroupSizeLimitPanel />
          </TabsContent>
        )}
      </Tabs>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent
          title={editing === "new" ? t("form.createTitle") : t("form.editTitle")}
          className="max-w-lg"
        >
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
        destructive
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
    </div>
  );
}
