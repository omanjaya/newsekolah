"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Alert,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { LockKeyhole, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  type MentorGroupMember,
  type MentorMeetingNote,
  useDeleteMentorMeetingNoteMutation,
  useMentorMeetingNotesQuery,
} from "../api";

import { MentorMeetingNoteDetailDialog } from "./mentor-meeting-note-detail-dialog";
import { MentorMeetingNoteForm } from "./mentor-meeting-note-form";

/**
 * Meeting notes for one group. Rendered for a caller holding
 * `manage_mentoring`, which the list endpoint requires. That permission
 * does not open every note: a note's content is for its mentor, a
 * counselor or leadership only (`domain.MeetingNote.VisibleTo`), so a
 * group manager such as the admin is sent the others as `withheld_count`
 * and told they exist instead of being shown an empty list. "Catat
 * pertemuan" is offered to whoever may write in the group: its mentor or a
 * group manager (`manage_mentor_groups`); a counselor reads only.
 */
export function MentorMeetingNotesPanel({
  groupId,
  mentorUserId,
  members,
}: {
  groupId: string;
  /** The group's guru wali, who writes its notes. */
  mentorUserId: string;
  members: MentorGroupMember[];
}): ReactElement {
  const t = useTranslations("app.mentoring.notes");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const managesGroups = useCan("manage_mentor_groups");
  const { me } = useSession();
  const canWrite = managesGroups || (me?.id !== undefined && me.id === mentorUserId);
  const timeZone = me?.tenant.timezone;

  const { data, isLoading } = useMentorMeetingNotesQuery(groupId);
  const studentMap = useDirectoryNames(members.map((member) => member.student_user_id));
  const studentNames = useMemo(
    () => new Map([...studentMap.entries()].map(([id, s]) => [id, formatDisplayName(s.name)])),
    [studentMap],
  );
  const remove = useDeleteMentorMeetingNoteMutation();

  const [editing, setEditing] = useState<MentorMeetingNote | "new" | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MentorMeetingNote | null>(null);

  const items = data?.data ?? [];
  const withheld = data?.withheld_count ?? 0;

  const columns = useMemo<ColumnDef<MentorMeetingNote>[]>(
    () => [
      {
        id: "metAt",
        header: t("columns.metAt"),
        enableSorting: false,
        // A moment, read in the school's zone as its detail dialog does.
        cell: ({ row }) => formatDate(row.original.met_at, { locale, timeZone }),
      },
      {
        id: "kind",
        header: t("columns.kind"),
        enableSorting: false,
        cell: ({ row }) => t(`form.kindOptions.${row.original.kind}`),
      },
      { accessorKey: "topic", header: t("columns.topic"), enableSorting: false },
    ],
    [t, locale, timeZone],
  );

  // Placed as the members tab places its own: in the table's toolbar, so
  // the empty state below never repeats it.
  const addButton = canWrite ? (
    <Button
      icon={<Plus />}
      onClick={() => {
        setEditing("new");
      }}
    >
      {t("add")}
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {withheld > 0 && items.length > 0 && (
        <Alert
          variant="info"
          icon={<LockKeyhole aria-hidden="true" />}
          title={t("withheldNotice", { count: withheld })}
        />
      )}
      <DataTable
        toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
        stateKey="features/mentoring/components/mentor-meeting-notes-panel:1"
        mode="local"
        searchable={false}
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        toolbarActions={addButton}
        isLoading={isLoading}
        getRowId={(item) => item.id}
        onRowActivate={(item) => {
          setViewingId(item.id);
        }}
        emptyState={
          withheld > 0 ? (
            <EmptyState
              icon={<LockKeyhole aria-hidden="true" />}
              title={t("withheldTitle", { count: withheld })}
              description={t("withheldBody")}
            />
          ) : (
            <EmptyState
              icon={<domainIcons.mentoring aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
          )
        }
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent
          title={editing === "new" ? t("form.createTitle") : t("form.editTitle")}
          size="lg"
        >
          {editing !== null && (
            <MentorMeetingNoteForm
              groupId={groupId}
              members={members}
              studentNames={studentNames}
              initial={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <MentorMeetingNoteDetailDialog
        noteId={viewingId}
        studentNames={studentNames}
        canEdit={canWrite}
        onClose={() => {
          setViewingId(null);
        }}
        onEdit={() => {
          const current = items.find((item) => item.id === viewingId);
          if (current) setEditing(current);
          setViewingId(null);
        }}
        onDelete={() => {
          const current = items.find((item) => item.id === viewingId);
          if (current) setPendingDelete(current);
          setViewingId(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("deleteTitle")}
        description={t("deleteBody")}
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
