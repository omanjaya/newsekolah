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

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useLookup, useTeachersQuery } from "../../reference/api";
import { type MentorGroup, useDeleteMentorGroupMutation, useMentorGroupsQuery } from "../api";

import { GroupSizeLimitPanel } from "./group-size-limit-panel";
import { MentorGroupForm } from "./mentor-group-form";

export function MentorGroupsView(): ReactElement {
  const t = useTranslations("app.mentoring.groups");
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_mentor_groups");

  const { data, isLoading } = useMentorGroupsQuery();
  const teachers = useTeachersQuery();
  const teacherMap = useLookup(teachers.data?.data);
  const remove = useDeleteMentorGroupMutation();

  const [tab, setTab] = useUrlState<string>("tab", ["groups", "limit"], "groups");
  const [editing, setEditing] = useState<MentorGroup | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MentorGroup | null>(null);

  const items = data?.data ?? [];

  const columns = useMemo<ColumnDef<MentorGroup>[]>(() => {
    const base: ColumnDef<MentorGroup>[] = [
      { accessorKey: "name", header: t("columns.name"), enableSorting: false },
      {
        id: "mentor",
        header: t("columns.mentor"),
        enableSorting: false,
        cell: ({ row }) => teacherMap.get(row.original.mentor_user_id)?.name ?? t("unknownMentor"),
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
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
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

      <Tabs value={tab} onValueChange={setTab} className="flex flex-col md:min-h-0 md:flex-1">
        <TabsList>
          <TabsTrigger value="groups">{t("tabs.groups")}</TabsTrigger>
          <TabsTrigger value="limit">{t("tabs.limit")}</TabsTrigger>
        </TabsList>
        <TabsContent value="groups" className="pt-4 md:min-h-0 md:flex-1">
          <div className="flex flex-col md:h-full md:min-h-0">
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
                  title={t("emptyTitle")}
                  description={t("emptyBody")}
                />
              }
            />
          </div>
        </TabsContent>
        <TabsContent value="limit" className="pt-4 md:min-h-0 md:flex-1 md:overflow-y-auto">
          <GroupSizeLimitPanel />
        </TabsContent>
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
