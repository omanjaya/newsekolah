"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Card,
  SkeletonList,
  Button,
  EmptyState,
  Input,
  StickySaveBar,
  useToast,
} from "@newsekolah/ui";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryLookup } from "../../reference/directory-names";
import {
  type AttendanceStatus,
  useClubMembersQuery,
  useMeetingRosterQuery,
  useRecordAttendanceMutation,
} from "../api";
import {
  DEFAULT_STATUS,
  computeAttendanceChanges,
  studentsToMarkPresent,
} from "../lib/meeting-status";

import { MeetingRosterRow } from "./meeting-roster-row";
import { MeetingStatusFilterChips } from "./meeting-status-filter-chips";

interface RosterStudent {
  id: string;
  name: string;
  /** The stored status, or undefined while none is recorded for this meeting. */
  recordedStatus: AttendanceStatus | undefined;
}

/**
 * Loads the meeting's roster (recorded entries only, per
 * `getMeetingRoster`'s contract) plus the club's active members, and
 * waits for both before handing off to the editor -- the editor itself
 * takes the merged, defaulted list as a prop and snapshots it once at
 * mount (attendance/components/session-editor.tsx's pattern), so a
 * background refetch triggered by a save mid-edit never wipes an
 * in-progress change to a different row.
 */
export function MeetingAttendanceEditor({
  clubId,
  meetingId,
}: {
  clubId: string;
  meetingId: string;
}): ReactElement {
  const t = useTranslations("app.activities.clubDetail.meetings.roster");
  const roster = useMeetingRosterQuery(meetingId);
  const members = useClubMembersQuery(clubId, false);
  const directory = useDirectoryLookup(
    (members.data?.data ?? []).map((member) => member.student_user_id),
  );

  if (roster.isLoading || members.isLoading || directory.isLoading) {
    return <SkeletonList rows={4} leading framed />;
  }
  if (roster.isError || members.isError) {
    return <Alert variant="danger" title={t("loadError")} />;
  }

  const activeMembers = (members.data?.data ?? []).filter((m) => m.status === "active");
  const entryById = new Map(
    (roster.data?.entries ?? []).map((entry) => [entry.student_user_id, entry.status_code]),
  );

  if (activeMembers.length === 0) {
    return (
      <EmptyState icon={<Users aria-hidden="true" />} title={t("noMembers")} className="mt-2" />
    );
  }

  const students: RosterStudent[] = activeMembers.map((member) => ({
    id: member.student_user_id,
    name: directory.names.get(member.student_user_id)?.name ?? t("unknownStudent"),
    recordedStatus: entryById.get(member.student_user_id),
  }));

  return <RosterEditor key={meetingId} meetingId={meetingId} students={students} />;
}

function RosterEditor({
  meetingId,
  students,
}: {
  meetingId: string;
  students: RosterStudent[];
}): ReactElement {
  const t = useTranslations("app.activities.clubDetail.meetings.roster");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const record = useRecordAttendanceMutation(meetingId);

  // What the server holds, snapshotted at mount and moved forward by each
  // save (this component is keyed by meetingId, so a background refetch
  // after a save re-renders the parent but does not remount this component
  // or reset either state below). A member with no recorded status has no
  // entry: shown as present, but still to be saved.
  const [savedStatuses, setSavedStatuses] = useState<Partial<Record<string, AttendanceStatus>>>(
    () =>
      Object.fromEntries(
        students.flatMap((s) => (s.recordedStatus ? [[s.id, s.recordedStatus]] : [])),
      ),
  );
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(students.map((s) => [s.id, s.recordedStatus ?? DEFAULT_STATUS])),
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<AttendanceStatus>>(new Set());
  const [saving, setSaving] = useState(false);

  const changes = computeAttendanceChanges(statuses, savedStatuses);

  const counts = useMemo(() => {
    const out: Record<AttendanceStatus, number> = { H: 0, I: 0, S: 0, A: 0 };
    for (const s of students) {
      const code = statuses[s.id] ?? "H";
      out[code] += 1;
    }
    return out;
  }, [students, statuses]);

  const visible = students.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter.size > 0) {
      const current = statuses[s.id] ?? "H";
      if (!statusFilter.has(current)) return false;
    }
    return true;
  });

  function toggleFilter(code: AttendanceStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function markAllPresent() {
    const ids = studentsToMarkPresent(
      students.map((s) => s.id),
      statuses,
    );
    setStatuses((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = "H";
      return next;
    });
  }

  async function save() {
    setSaving(true);
    // Each row is its own POST (upserted server-side by meeting + student).
    // Every pending row is sent, present ones included, so the meeting's
    // record says who attended rather than only the exceptions. A row moves
    // into the saved snapshot as soon as its request succeeds, so a failure
    // part way leaves only the unsent rows marked.
    const sent: Record<string, AttendanceStatus> = {};
    try {
      for (const studentId of changes.pendingStudentIds) {
        const code = statuses[studentId] ?? DEFAULT_STATUS;
        await record.mutateAsync({ student_user_id: studentId, status_code: code });
        sent[studentId] = code;
      }
      toast.success(t("recorded"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setSavedStatuses((prev) => ({ ...prev, ...sent }));
      setSaving(false);
    }
  }

  const footer =
    changes.count > 0
      ? t("unsavedChanges", { count: changes.count })
      : changes.unrecordedStudentIds.size > 0
        ? t("notRecorded")
        : t("saveHint");

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="w-full sm:w-64"
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={saving}
          onClick={markAllPresent}
          className="sm:ml-auto"
        >
          {t("markAllPresent")}
        </Button>
      </div>

      <MeetingStatusFilterChips counts={counts} active={statusFilter} onToggle={toggleFilter} />

      <Card className="divide-y divide-line overflow-hidden" asChild>
        <ul>
          {visible.map((s) => (
            <MeetingRosterRow
              key={s.id}
              studentId={s.id}
              name={s.name}
              status={statuses[s.id] ?? "H"}
              changed={changes.changedStudentIds.has(s.id)}
              disabled={saving}
              onStatusChange={(studentId, code) => {
                setStatuses((prev) => ({ ...prev, [studentId]: code }));
              }}
            />
          ))}
          {visible.length === 0 && (
            <li className="px-4 py-6 text-center text-body-sm text-fg-muted">{t("noMatch")}</li>
          )}
        </ul>
      </Card>

      <StickySaveBar
        leadingSlot={<span className="text-body-sm text-fg-muted">{footer}</span>}
        saveLabel={t("save")}
        saving={saving}
        disabled={changes.pendingStudentIds.size === 0}
        onSave={() => void save()}
      />
    </div>
  );
}
