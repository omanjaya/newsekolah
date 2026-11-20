"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import {
  Alert,
  Button,
  SearchInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  useSubmitValidation,
  useToast,
} from "@newsekolah/ui";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDraftOwner } from "../../../lib/drafts/draft-owner";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useModuleEnabled } from "../../../lib/modules/use-module-enabled";
import { useUnsavedChangesProtection } from "../../../lib/navigation/use-unsaved-changes-protection";
import { useSession } from "../../../lib/session/session-provider";
import { businessNow, useBusinessNow } from "../../../lib/simulation/clock";
import { todayInZone } from "../../../lib/tenant-date";
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
import { attendanceListHref, overriddenNames } from "../lib/session-save";

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
  const tWorkspace = useTranslations("app.academic.workspace");
  const tEditor = useTranslations("app.attendanceEditor");
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const draftOwner = useDraftOwner();
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
  // A save stopped by a half-filled journal shows the journal's field
  // errors and focuses the first, once the journal tab has mounted it.
  const {
    ref: journalRef,
    attempted: journalAttempted,
    check: checkJournal,
  } = useSubmitValidation<HTMLDivElement>();
  const tValidation = useTranslations("validation");
  const violationTypes = useViolationTypesQuery();
  const now = useBusinessNow();
  const disciplineOn = useModuleEnabled("discipline");

  // Offer to restore an in-progress draft the browser still has from
  // before a reload or a dropped connection, once per session and owner:
  // rechecked when the owner becomes known, and withdrawn when there is
  // none. This reads `window.localStorage`, which does not exist during
  // server rendering, so it cannot move into a lazy `useState` initializer
  // the way a server-safe value could -- the effect is the deliberate,
  // correct way to reach it only after the client has mounted.
  useEffect(() => {
    const draft = loadAttendanceDraft(draftOwner, session.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the comment above.
    setDraftOffer(draft ? { savedAt: draft.savedAt } : null);
  }, [draftOwner, session.id]);

  // The API says which mode this viewer saves in: the lesson's own teacher
  // (or accepted substitute) keeps re-saving in normal mode after the
  // first save; only a homeroom teacher or corrector opening someone
  // else's lesson goes through correction, with a reason.
  const isCorrection =
    openedInCorrection || (Boolean(session.submitted_at) && session.save_mode !== "normal");
  // Nothing can be recorded before the lesson starts.
  const notStartedYet =
    session.starts_at !== undefined && now.getTime() < Date.parse(session.starts_at);
  // A journal is optional, but once either required field is filled both are.
  const journalStarted = topic.trim() !== "" || activities.trim() !== "";
  const journalComplete = topic.trim() !== "" && activities.trim() !== "";

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
    saveAttendanceDraft(draftOwner, session.id, {
      statuses,
      notes,
      violations,
      topic,
      activities,
      reflection,
    });
  }, [draftOwner, session.id, statuses, notes, violations, topic, activities, reflection, isDirty]);

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
    // Says what the bulk action left alone, at the moment it matters.
    toast.info(t("markedAllPresent"), { description: t("markAllPresentHint") });
  }

  function resetChanges() {
    setStatuses(initialStatuses);
    setNotes(initialNotes);
    setViolations({});
    setTopic(initialJournal.topic);
    setActivities(initialJournal.activities);
    setReflection(initialJournal.reflection);
    setReason("");
    clearAttendanceDraft(draftOwner, session.id);
  }

  function restoreDraft() {
    const draft = loadAttendanceDraft(draftOwner, session.id);
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
    clearAttendanceDraft(draftOwner, session.id);
    setDraftOffer(null);
  }

  async function submit() {
    setFormError(null);
    if (notStartedYet) return;
    if (!checkJournal(!journalStarted || journalComplete)) {
      setActiveTab("journal");
      setFormError(t("journalIncomplete"));
      return;
    }
    if (isCorrection && reason.trim() === "") {
      setFormError(t("reasonRequired"));
      return;
    }
    try {
      const saved = await save.mutateAsync({
        mode: isCorrection ? "correction" : "normal",
        ...(isCorrection ? { reason: reason.trim() } : {}),
        entries: session.roster
          .filter((item) => !item.blocked)
          .map((item) => ({
            student_user_id: item.student_user_id,
            status_code: statuses[item.student_user_id] ?? defaultCode,
            ...(notes[item.student_user_id] ? { notes: notes[item.student_user_id] } : {}),
            // Discipline off: violations (say from a restored draft) are not sent.
            ...(disciplineOn && violations[item.student_user_id]?.length
              ? { violation_ids: violations[item.student_user_id] }
              : {}),
          })),
        ...(journalComplete
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
      clearAttendanceDraft(draftOwner, session.id);
      toast.success(
        t("savedAt", {
          time: formatTime(businessNow(), { locale, timeZone: me?.tenant.timezone }),
        }),
      );
      // A student covered by a leave letter keeps the letter's status
      // whatever was sent; say so rather than let the success stand alone.
      const kept = overriddenNames(saved.overridden_student_ids, session.roster);
      if (kept.length > 0) {
        toast.warning(t("overriddenByLeave", { names: kept.join(", ") }));
      }
      // Back to the day the lesson belongs to, not always today.
      router.push(attendanceListHref(session.date, todayInZone(me?.tenant.timezone)));
    } catch (error) {
      setFormError(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const className = classMap.get(session.class_id)?.name ?? "";
  const subjectName = subjectMap.get(session.subject_id)?.name ?? "";
  // The journal's state is one dot on its tab: saved with this session
  // already, or written now and saved together with the roster.
  const journalFilled = journalComplete;

  return (
    <SessionRosterHeader
      session={session}
      className={className}
      subjectName={subjectName}
      isCorrection={isCorrection}
      timeZone={me?.tenant.timezone}
      onMarkAllPresent={markAllPresent}
      onResetChanges={resetChanges}
      canReset={isDirty}
      disabled={save.isPending}
      floating={
        <SessionSaveBar
          disabled={notStartedYet}
          isCorrection={isCorrection}
          reason={reason}
          onReasonChange={setReason}
          studentTotal={session.roster.length}
          changedFromDefaultCount={session.roster.length - (counts[defaultCode] ?? 0)}
          saving={save.isPending}
          formError={formError}
          onSave={() => void submit()}
        />
      }
    >
      {notStartedYet && session.starts_at && (
        <Alert tone="info" title={t("notStartedTitle")}>
          {t("notStartedBody", {
            time: formatTime(session.starts_at, { locale, timeZone: me?.tenant.timezone }),
          })}
        </Alert>
      )}
      {draftOffer && (
        <Alert
          variant="warning"
          title={t("draftFoundTitle")}
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={dismissDraft}>
                {t("draftDismiss")}
              </Button>
              <Button size="sm" onClick={restoreDraft}>
                {t("draftRestore")}
              </Button>
            </div>
          }
        >
          {t("draftFoundBody", {
            time: formatTime(draftOffer.savedAt, { locale, timeZone: me?.tenant.timezone }),
          })}
        </Alert>
      )}

      {/* PageShell pads the page clear of the fixed save bar. */}
      <Tabs
        ref={journalRef}
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2">
          <TabsList aria-label={t("tabsLabel")} className="shrink-0">
            <TabsTrigger value="roster">{t("tabRoster")}</TabsTrigger>
            <TabsTrigger value="journal">
              {t("tabJournal")}
              <span
                role="img"
                className={cn("size-2 rounded-full", journalFilled ? "bg-accent" : "bg-warning")}
                aria-label={journalFilled ? t("journalFilled") : tWorkspace("journalMissing")}
                title={journalFilled ? t("journalFilled") : tWorkspace("journalMissing")}
              />
            </TabsTrigger>
          </TabsList>
          {activeTab === "roster" && (
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="min-w-0 flex-1 sm:ml-auto sm:max-w-64"
            />
          )}
        </div>
        <TabsContent value="roster" className="pt-0">
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
            statusFilter={statusFilter}
            onToggleStatusFilter={toggleStatusFilter}
            onStatusChange={handleStatusChange}
            onNoteChange={handleNoteChange}
            onToggleViolation={handleToggleViolation}
          />
        </TabsContent>
        <TabsContent value="journal" className="pt-0">
          <SessionJournalPanel
            previousTopic={session.previous_journal_topic}
            topic={topic}
            activities={activities}
            reflection={reflection}
            disabled={save.isPending}
            onTopicChange={setTopic}
            onActivitiesChange={setActivities}
            onReflectionChange={setReflection}
            requiredError={
              journalStarted
                ? (value) =>
                    journalAttempted && !value.trim() ? tValidation("required") : undefined
                : undefined
            }
          />
        </TabsContent>
      </Tabs>
    </SessionRosterHeader>
  );
}
