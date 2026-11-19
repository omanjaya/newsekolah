"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
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
import { Plus } from "lucide-react";
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
 * Meeting notes for one group. Only rendered when the caller already holds
 * `manage_mentoring` (mentor, counselor, or leadership per
 * `domain.MeetingNote.VisibleTo`) since the list endpoint itself is
 * restricted to that permission.
 */
export function MentorMeetingNotesPanel({
  groupId,
  members,
}: {
  groupId: string;
  members: MentorGroupMember[];
}): ReactElement {
  const t = useTranslations("app.mentoring.notes");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_mentoring");
  const { me } = useSession();
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
  const addButton = canManage ? (
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
          <EmptyState
            icon={<domainIcons.mentoring aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
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
        canEdit={canManage}
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
