"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, EmptyState, Input, StickySaveBar, useToast } from "@newsekolah/ui";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery } from "../../reference/api";
import {
  type AttendanceStatus,
  useClubMembersQuery,
  useMeetingRosterQuery,
  useRecordAttendanceMutation,
} from "../api";
import { computeAttendanceChanges, studentsToMarkPresent } from "../lib/meeting-status";

import { MeetingRosterRow } from "./meeting-roster-row";
import { MeetingStatusFilterChips } from "./meeting-status-filter-chips";

interface RosterStudent {
  id: string;
  name: string;
  initialStatus: AttendanceStatus;
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
  const directory = useDirectoryQuery("student");

  if (roster.isLoading || members.isLoading || directory.isLoading) {
    return <p className="mt-2 p-3 text-[13px] text-fg-muted">{t("loading")}</p>;
  }
  if (roster.isError || members.isError) {
    return (
      <p role="alert" className="mt-2 p-3 text-[13px] text-status-absent">
        {t("loadError")}
      </p>
    );
  }

  const activeMembers = (members.data?.data ?? []).filter((m) => m.status === "active");
  const nameById = new Map((directory.data?.data ?? []).map((u) => [u.id, u.name]));
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
    name: nameById.get(member.student_user_id) ?? t("unknownStudent"),
    // Every active member defaults to present; only a member with an
    // already-recorded entry shows a different status.
    initialStatus: entryById.get(member.student_user_id) ?? "H",
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

  // Snapshotted once at mount (this component is keyed by meetingId, so a
  // background refetch after a save re-renders the parent but does not
  // remount this component or reset either state below).
  const [initialStatuses] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(students.map((s) => [s.id, s.initialStatus])),
  );
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(initialStatuses);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<AttendanceStatus>>(new Set());
  const [saving, setSaving] = useState(false);

  const changes = computeAttendanceChanges(statuses, initialStatuses);

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
    try {
      // No batch endpoint exists for this roster (each status is its own
      // POST, upserted server-side by meeting + student); looping only
      // over the changed rows keeps this to the minimum number of
      // requests instead of one per visible student.
      for (const studentId of changes.changedStudentIds) {
        await record.mutateAsync({
          student_user_id: studentId,
          status_code: statuses[studentId] ?? "H",
        });
      }
      toast.success(t("recorded"));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    } finally {
      setSaving(false);
    }
  }

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

      <ul className="divide-y divide-border rounded-sm border border-border">
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
          <li className="px-4 py-6 text-center text-[13px] text-fg-muted">{t("noMatch")}</li>
        )}
      </ul>

      <StickySaveBar
        leadingSlot={
          <span className="text-[13px] text-fg-muted">
            {changes.count > 0 ? t("unsavedChanges", { count: changes.count }) : t("saveHint")}
          </span>
        }
        saveLabel={t("save")}
        saving={saving}
        disabled={changes.count === 0}
        onSave={() => void save()}
      />
    </div>
  );
}
