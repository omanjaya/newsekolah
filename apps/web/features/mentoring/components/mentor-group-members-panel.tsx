"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Select,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type MentorGroupMember,
  useAssignMentorGroupMemberMutation,
  useGroupSizeLimitQuery,
  useMentorGroupMembersQuery,
  useRemoveMentorGroupMemberMutation,
} from "../api";

export function MentorGroupMembersPanel({ groupId }: { groupId: string }): ReactElement {
  const t = useTranslations("app.mentoring.members");
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_mentor_groups");

  const { data, isLoading } = useMentorGroupMembersQuery(groupId);
  const limit = useGroupSizeLimitQuery();
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const assign = useAssignMentorGroupMemberMutation(groupId);
  const remove = useRemoveMentorGroupMemberMutation(groupId);

  const [adding, setAdding] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [pendingRemove, setPendingRemove] = useState<MentorGroupMember | null>(null);

  const members = data?.data ?? [];
  const memberIds = new Set(members.map((m) => m.student_user_id));
  const atCapacity = limit.data !== undefined && members.length >= limit.data.limit;

  const candidateOptions = (students.data?.data ?? [])
    .filter((s) => !memberIds.has(s.id))
    .map((s) => ({ value: s.id, label: s.name }));

  const columns = useMemo<ColumnDef<MentorGroupMember>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        cell: ({ row }) =>
          studentMap.get(row.original.student_user_id)?.name ?? t("unknownStudent"),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<User />}
              onClick={() => {
                router.push(
                  `/mentoring/groups/${groupId}/students/${row.original.student_user_id}`,
                );
              }}
            >
              {t("view")}
            </Button>
            {canManage && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPendingRemove(row.original);
                }}
              >
                {t("remove")}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, studentMap, canManage, router, groupId],
  );

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-fg-muted">
            {limit.data
              ? t("countOfLimit", { count: members.length, limit: limit.data.limit })
              : ""}
          </p>
          <Button
            size="sm"
            icon={<Plus />}
            disabled={atCapacity}
            onClick={() => {
              setAdding(true);
            }}
          >
            {t("add")}
          </Button>
        </div>
      )}
      {canManage && atCapacity && <p className="text-[13px] text-fg-muted">{t("atCapacity")}</p>}

      <DataTable
        data={members}
        columns={columns}
        rowCount={members.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        isLoading={isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.users aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <Dialog
        open={adding}
        onOpenChange={(open) => {
          setAdding(open);
          if (!open) setCandidateId("");
        }}
      >
        <DialogContent title={t("addTitle")} className="max-w-md">
          <div className="flex flex-col gap-4">
            <Select
              options={candidateOptions}
              value={candidateId}
              onValueChange={setCandidateId}
              placeholder={t("addPlaceholder")}
            />
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setAdding(false);
                }}
              >
                {t("cancel")}
              </Button>
              <Button
                loading={assign.isPending}
                disabled={!candidateId}
                onClick={() => {
                  assign.mutate(candidateId, {
                    onSuccess: () => {
                      toast.success(t("added"));
                      setAdding(false);
                      setCandidateId("");
                    },
                    onError: (error) => {
                      toast.error(
                        error instanceof ApiError
                          ? apiErrorMessage(error.code)
                          : apiErrorMessage("UNKNOWN"),
                      );
                    },
                  });
                }}
              >
                {t("addConfirm")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
        title={t("removeTitle")}
        description={
          pendingRemove
            ? t("removeBody", {
                name: studentMap.get(pendingRemove.student_user_id)?.name ?? t("unknownStudent"),
              })
            : ""
        }
        confirmLabel={t("remove")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingRemove) return;
          try {
            await remove.mutateAsync(pendingRemove.student_user_id);
            toast.success(t("removed"));
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          } finally {
            setPendingRemove(null);
          }
        }}
      />
    </div>
  );
}
