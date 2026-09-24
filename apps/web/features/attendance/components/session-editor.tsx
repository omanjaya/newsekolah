"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import { Alert, Button, Tabs, TabsContent, TabsList, TabsTrigger, useToast } from "@newsekolah/ui";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useUnsavedChangesProtection } from "../../../lib/navigation/use-unsaved-changes-protection";
import { useSession } from "../../../lib/session/session-provider";
import { type ViolationType, useViolationTypesQuery } from "../../discipline/api";
import { useClassesQuery, useLookup, useSubjectsQuery } from "../../reference/api";
import { type SessionDetail, useSaveEntriesMutation } from "../api";
import {
  clearAttendanceDraft,
  loadAttendanceDraft,
  saveAttendanceDraft,
} from "../lib/attendance-draft";
import { studentsToMarkPresent } from "../lib/bulk-actions";
import { computeJournalChangeCount, computeRosterChanges } from "../lib/change-tracking";

import { SessionJournalPanel } from "./session-journal-panel";
import { SessionRosterHeader } from "./session-roster-header";
import { SessionRosterPanel } from "./session-roster-panel";
import { SessionSaveBar } from "./session-save-bar";

const EMPTY_VIOLATION_TYPES: ViolationType[] = [];

export function SessionEditor({
  session,
  openedInCorrection,
}: {
  session: SessionDetail;
  openedInCorrection: boolean;
}): ReactElement {
  const t = useTranslations("app.attendance.session");
  const tEditor = useTranslations("app.attendanceEditor");
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const save = useSaveEntriesMutation(session.id);

  const defaultCode =
    session.statuses.find((s) => s.counts_as_present)?.code ?? session.statuses[0]?.code ?? "H";

  const initialStatuses = useMemo(
    () =>
      Object.fromEntries(
        session.roster.map((item) => [item.student_user_id, item.current_status ?? defaultCode]),
      ),
    [defaultCode, session.roster],
  );
  const initialNotes = useMemo(
    () =>
      Object.fromEntries(session.roster.map((item) => [item.student_user_id, item.notes ?? ""])),
    [session.roster],
  );
  const initialJournal = useMemo(
    () => ({
      topic: session.journal_topic ?? "",
      activities: session.journal_activities ?? "",
      reflection: session.journal_reflection ?? "",
    }),
    [session.journal_activities, session.journal_reflection, session.journal_topic],
  );

  const [statuses, setStatuses] = useState<Record<string, string>>(initialStatuses);
  const [notes, setNotes] = useState<Record<string, string>>(initialNotes);
  const [violations, setViolations] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("roster");
  const [topic, setTopic] = useState(initialJournal.topic);
  const [activities, setActivities] = useState(initialJournal.activities);
  const [reflection, setReflection] = useState(initialJournal.reflection);
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);
  const [draftOffer, setDraftOffer] = useState<{ savedAt: string } | null>(null);
  const violationTypes = useViolationTypesQuery();

  // Offer to restore an in-progress draft the browser still has from
  // before a reload or a dropped connection, once per mount. This reads
  // `window.localStorage`, which does not exist during server rendering,
  // so it cannot move into a lazy `useState` initializer the way a
  // server-safe value could -- the effect is the deliberate, correct way
  // to reach it only after the client has mounted.
  useEffect(() => {
    const draft = loadAttendanceDraft(session.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the comment above.
    if (draft) setDraftOffer({ savedAt: draft.savedAt });
  }, [session.id]);

  const isCorrection = Boolean(session.submitted_at) || openedInCorrection;
  const presentCodes = useMemo(
    () => new Set(session.statuses.filter((s) => s.counts_as_present).map((s) => s.code)),
    [session.statuses],
  );

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const item of session.roster) {
      const code = statuses[item.student_user_id] ?? defaultCode;
      out[code] = (out[code] ?? 0) + 1;
    }
    return out;
  }, [session.roster, statuses, defaultCode]);

  const rosterChanges = useMemo(
    () => computeRosterChanges(statuses, notes, violations, initialStatuses, initialNotes),
    [statuses, notes, violations, initialStatuses, initialNotes],
  );
  const journalChangeCount = computeJournalChangeCount(
    topic,
    activities,
    reflection,
    initialJournal.topic,
    initialJournal.activities,
    initialJournal.reflection,
  );
  const pendingChanges = rosterChanges.count + journalChangeCount + (reason !== "" ? 1 : 0);
  const isDirty = pendingChanges > 0;
  useUnsavedChangesProtection(isDirty && !savedSuccessfully, tEditor("discardChanges"));

  // Mirrors every edit to localStorage (try/catch inside the helper) so a
  // dropped classroom connection or an accidental reload does not throw
  // away work still in memory; cleared the moment a save succeeds.
  useEffect(() => {
    if (!isDirty) return;
    saveAttendanceDraft(session.id, { statuses, notes, violations, topic, activities, reflection });
  }, [session.id, statuses, notes, violations, topic, activities, reflection, isDirty]);

  const handleStatusChange = useCallback((studentId: string, statusCode: string) => {
    setStatuses((prev) => ({ ...prev, [studentId]: statusCode }));
  }, []);

  const handleNoteChange = useCallback((studentId: string, value: string) => {
    setNotes((prev) => ({ ...prev, [studentId]: value }));
  }, []);

  const handleToggleViolation = useCallback((studentId: string, violationTypeId: string) => {
    setViolations((prev) => {
      const current = prev[studentId] ?? [];
      const next = current.includes(violationTypeId)
        ? current.filter((id) => id !== violationTypeId)
        : [...current, violationTypeId];
      return { ...prev, [studentId]: next };
    });
  }, []);

  function toggleStatusFilter(code: string) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function markAllPresent() {
    const ids = studentsToMarkPresent(session.roster, statuses, defaultCode);
    setStatuses((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = defaultCode;
      return next;
    });
  }

  function resetChanges() {
    setStatuses(initialStatuses);
    setNotes(initialNotes);
    setViolations({});
    setTopic(initialJournal.topic);
    setActivities(initialJournal.activities);
    setReflection(initialJournal.reflection);
    setReason("");
    clearAttendanceDraft(session.id);
  }

  function restoreDraft() {
    const draft = loadAttendanceDraft(session.id);
    if (!draft) return;
    setStatuses((prev) => ({ ...prev, ...draft.statuses }));
    setNotes((prev) => ({ ...prev, ...draft.notes }));
    setViolations((prev) => ({ ...prev, ...draft.violations }));
    setTopic(draft.topic);
    setActivities(draft.activities);
    setReflection(draft.reflection);
    setDraftOffer(null);
  }

  function dismissDraft() {
    clearAttendanceDraft(session.id);
    setDraftOffer(null);
  }

  async function submit() {
    setFormError(null);
    if (isCorrection && reason.trim() === "") {
      setFormError(t("reasonRequired"));
      return;
    }
    try {
      await save.mutateAsync({
        mode: isCorrection ? "correction" : "normal",
        ...(isCorrection ? { reason: reason.trim() } : {}),
        entries: session.roster
          .filter((item) => !item.blocked)
          .map((item) => ({
            student_user_id: item.student_user_id,
            status_code: statuses[item.student_user_id] ?? defaultCode,
            ...(notes[item.student_user_id] ? { notes: notes[item.student_user_id] } : {}),
            ...(violations[item.student_user_id]?.length
              ? { violation_ids: violations[item.student_user_id] }
              : {}),
          })),
        ...(topic.trim()
          ? {
              journal: {
                topic: topic.trim(),
                activities: activities.trim(),
                ...(reflection.trim() ? { reflection: reflection.trim() } : {}),
              },
            }
          : {}),
      });
      setSavedSuccessfully(true);
      clearAttendanceDraft(session.id);
      toast.success(
        t("savedAt", { time: formatTime(new Date(), { locale, timeZone: me?.tenant.timezone }) }),
      );
      router.push("/attendance");
    } catch (error) {
      setFormError(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const className = classMap.get(session.class_id)?.name ?? "";
  const subjectName = subjectMap.get(session.subject_id)?.name ?? "";

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 md:p-6 md:pb-28">
      <SessionRosterHeader
        session={session}
        className={className}
        subjectName={subjectName}
        isCorrection={isCorrection}
        timeZone={me?.tenant.timezone}
      />

      {draftOffer && (
        <Alert variant="warning" title={t("draftFoundTitle")}>
          <p>
            {t("draftFoundBody", {
              time: formatTime(draftOffer.savedAt, { locale, timeZone: me?.tenant.timezone }),
            })}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={restoreDraft}>
              {t("draftRestore")}
            </Button>
            <Button size="sm" variant="secondary" onClick={dismissDraft}>
              {t("draftDismiss")}
            </Button>
          </div>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="roster">{t("tabRoster")}</TabsTrigger>
          <TabsTrigger value="journal" className="flex items-center gap-1.5">
            {t("tabJournal")}
            {topic.trim() !== "" && (
              <span
                className="size-1.5 rounded-full bg-accent"
                aria-label={t("journalFilled")}
                title={t("journalFilled")}
              />
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="roster">
          <SessionRosterPanel
            roster={session.roster}
            statuses={session.statuses}
            counts={counts}
            currentStatuses={statuses}
            notes={notes}
            violations={violations}
            violationTypes={violationTypes.data?.data ?? EMPTY_VIOLATION_TYPES}
            violationTypesLoading={violationTypes.isLoading}
            changedStudentIds={rosterChanges.changedStudentIds}
            presentCodes={presentCodes}
            defaultCode={defaultCode}
            disabled={save.isPending}
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onToggleStatusFilter={toggleStatusFilter}
            onStatusChange={handleStatusChange}
            onNoteChange={handleNoteChange}
            onToggleViolation={handleToggleViolation}
            onMarkAllPresent={markAllPresent}
            onResetChanges={resetChanges}
            canReset={isDirty}
          />
        </TabsContent>
        <TabsContent value="journal">
          <SessionJournalPanel
            previousTopic={session.previous_journal_topic}
            topic={topic}
            activities={activities}
            reflection={reflection}
            disabled={save.isPending}
            onTopicChange={setTopic}
            onActivitiesChange={setActivities}
            onReflectionChange={setReflection}
          />
        </TabsContent>
      </Tabs>

      <SessionSaveBar
        isCorrection={isCorrection}
        reason={reason}
        onReasonChange={setReason}
        isDirty={isDirty}
        pendingChanges={pendingChanges}
        saving={save.isPending}
        formError={formError}
        onSave={() => void submit()}
      />
    </div>
  );
}
