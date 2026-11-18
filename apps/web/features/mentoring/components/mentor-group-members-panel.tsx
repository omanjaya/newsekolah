"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  DialogFooter,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  RowActionsMenu,
  domainIcons,
  useToast,
  type RowActionsMenuItem,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, User, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import { useDirectoryNames } from "../../reference/directory-names";
import { studentProfileHref } from "../../students/href";
import {
  type MentorGroupMember,
  useAssignMentorGroupMemberMutation,
  useGroupSizeLimitQuery,
  useMentorGroupMembersQuery,
  useRemoveMentorGroupMemberMutation,
} from "../api";

/**
 * A mentoring group's members. A row opens the mentor's view of that
 * student; its menu holds the general profile (when the reader may open
 * it) and, for whoever manages groups, removal behind a confirmation. The
 * add action sits in the table's toolbar; the group's size against its
 * limit is in the page header (mentor-group-detail-view.tsx).
 */
export function MentorGroupMembersPanel({ groupId }: { groupId: string }): ReactElement {
  const t = useTranslations("app.mentoring.members");
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_mentor_groups");
  const { me } = useSession();
  // The profile route's guard answers by path, the same for every student.
  const canOpenProfile = me ? canOpenPath(studentProfileHref(groupId), navAccessFromMe(me)) : false;

  const { data, isLoading } = useMentorGroupMembersQuery(groupId);
  const limit = useGroupSizeLimitQuery();
  const assign = useAssignMentorGroupMemberMutation(groupId);
  const remove = useRemoveMentorGroupMemberMutation(groupId);

  const [adding, setAdding] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [pendingRemove, setPendingRemove] = useState<MentorGroupMember | null>(null);

  const members = useMemo(() => data?.data ?? [], [data]);
  const studentMap = useDirectoryNames(members.map((m) => m.student_user_id));
  const candidateLabels = useDirectoryPickerLabels(t("addPlaceholder"));
  const memberIds = new Set(members.map((m) => m.student_user_id));
  const atCapacity = limit.data !== undefined && members.length >= limit.data.limit;

  const columns = useMemo<ColumnDef<MentorGroupMember>[]>(() => {
    const student: ColumnDef<MentorGroupMember> = {
      id: "student",
      header: t("columns.student"),
      enableSorting: false,
      meta: { card: "title", label: t("columns.student") },
      // Plain text: the row itself opens the student.
      cell: ({ row }) => {
        const name = studentMap.get(row.original.student_user_id)?.name;
        return name ? formatDisplayName(name) : t("unknownStudent");
      },
    };
    if (!canOpenProfile && !canManage) return [student];
    return [
      student,
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        meta: { label: t("columns.actions") },
        cell: ({ row }) => {
          const member = row.original;
          const items: RowActionsMenuItem[] = [
            ...(canOpenProfile
              ? [
                  {
                    label: t("viewProfile"),
                    icon: <User />,
                    onClick: () => {
                      router.push(studentProfileHref(member.student_user_id));
                    },
                  },
                ]
              : []),
            ...(canManage
              ? [
                  {
                    label: t("remove"),
                    icon: <UserMinus />,
                    tone: "danger" as const,
                    onClick: () => {
                      setPendingRemove(member);
                    },
                  },
                ]
              : []),
          ];
          const name = studentMap.get(member.student_user_id)?.name;
          return (
            <RowActionsMenu
              ariaLabel={t("actionsFor", {
                name: name ? formatDisplayName(name) : t("unknownStudent"),
              })}
              items={items}
            />
          );
        },
      },
    ];
  }, [t, studentMap, canManage, canOpenProfile, router]);

  const addButton = canManage ? (
    <Button
      icon={<Plus />}
      disabled={atCapacity}
      onClick={() => {
        setAdding(true);
      }}
    >
      {t("add")}
    </Button>
  ) : undefined;

  const pendingRemoveRawName = pendingRemove
    ? studentMap.get(pendingRemove.student_user_id)?.name
    : undefined;
  const pendingRemoveName = pendingRemoveRawName
    ? formatDisplayName(pendingRemoveRawName)
    : t("unknownStudent");

  return (
    <div className="flex flex-col gap-4">
      {/* Why the add action is off: said once, above the table it acts on. */}
      {canManage && atCapacity && <p className="text-body-sm text-fg-muted">{t("atCapacity")}</p>}

      <DataTable
        stateKey="features/mentoring/components/mentor-group-members-panel:1"
        mode="local"
        searchable={false}
        data={members}
        columns={columns}
        rowCount={members.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        toolbarActions={addButton}
        isLoading={isLoading}
        getRowId={(item) => item.id}
        onRowActivate={(member) => {
          router.push(`/mentoring/groups/${groupId}/students/${member.student_user_id}`);
        }}
        // The toolbar's add action, right above, is the way forward.
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
        <DialogContent title={t("addTitle")}>
          <div className="flex flex-col gap-4">
            <DirectoryPicker
              profileKind="student"
              value={candidateId}
              onValueChange={setCandidateId}
              labels={candidateLabels}
              className="w-full"
            />
            <DialogFooter>
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
                disabled={!candidateId || memberIds.has(candidateId)}
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
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
        title={t("removeTitle")}
        description={pendingRemove ? t("removeBody", { name: pendingRemoveName }) : ""}
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
