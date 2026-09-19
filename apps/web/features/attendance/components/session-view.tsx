"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Input,
  PageHeader,
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useUnsavedChangesProtection } from "../../../lib/navigation/use-unsaved-changes-protection";
import { type ViolationType, useViolationTypesQuery } from "../../discipline/api";
import { useClassesQuery, useLookup, useSubjectsQuery } from "../../reference/api";
import { type SessionDetail, useSaveEntriesMutation, useSessionQuery } from "../api";

import { SessionRosterRow } from "./session-roster-row";

/** Stable empty fallbacks so an unset lookup does not hand a row a fresh
 * array identity every render, which would defeat its memoization. */
const EMPTY_VIOLATION_TYPES: ViolationType[] = [];
const EMPTY_VIOLATIONS: string[] = [];

/**
 * The teacher's roster grid (docs/07-ui-ux.md section 4): every student
 * defaults to present, one tap changes status, search and an
 * "only not present" toggle keep a class of 36 under 30 seconds. Students
 * locked by an issued leave letter or an active permit show why.
 */
export function SessionView({
  sessionId,
  openedInCorrection = false,
}: {
  sessionId: string;
  /**
   * The session was opened for a class the caller neither teaches nor
   * substitutes for (a corrector or homeroom teacher reaching a past,
   * never-submitted session): the save must go through correction mode
   * from the first save, not only once something has already been
   * submitted.
   */
  openedInCorrection?: boolean;
}): ReactElement {
  const { data, isLoading, error, isRefetchError, refetch } = useSessionQuery(sessionId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error && !isRefetchError) {
    return <QueryError retry={refetch} className="m-6" />;
  }
  if (!data) return <QueryError retry={refetch} className="m-6" />;
  return (
    <SessionEditor
      key={data.submitted_at ?? "open"}
      session={data}
      openedInCorrection={openedInCorrection}
    />
  );
}

function SessionEditor({
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
  const classes = useClassesQuery();
  const subjects = useSubjectsQuery();
  const classMap = useLookup(classes.data?.data);
  const subjectMap = useLookup(subjects.data?.data);
  const save = useSaveEntriesMutation(session.id);

  const defaultCode =
    session.statuses.find((s) => s.counts_as_present)?.code ?? session.statuses[0]?.code ?? "H";
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      session.roster.map((item) => [item.student_user_id, item.current_status ?? defaultCode]),
    ),
  );
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(session.roster.map((item) => [item.student_user_id, item.notes ?? ""])),
  );
  const [search, setSearch] = useState("");
  const [onlyAbsent, setOnlyAbsent] = useState(false);
  const [topic, setTopic] = useState(session.journal_topic ?? "");
  const [activities, setActivities] = useState(session.journal_activities ?? "");
  const [reflection, setReflection] = useState(session.journal_reflection ?? "");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);
  // Violation types per student, additive to the roster and not
  // round-tripped from the session payload: the API records what a save
  // sends and does not report back what was attached before, so there is
  // nothing to prefill here.
  const [violations, setViolations] = useState<Record<string, string[]>>({});
  const violationTypes = useViolationTypesQuery();

  const initialValues = useMemo(
    () => ({
      statuses: Object.fromEntries(
        session.roster.map((item) => [item.student_user_id, item.current_status ?? defaultCode]),
      ),
      notes: Object.fromEntries(
        session.roster.map((item) => [item.student_user_id, item.notes ?? ""]),
      ),
      topic: session.journal_topic ?? "",
      activities: session.journal_activities ?? "",
      reflection: session.journal_reflection ?? "",
    }),
    [defaultCode, session],
  );

  const isCorrection = Boolean(session.submitted_at) || openedInCorrection;
  const presentCodes = useMemo(
    () => new Set(session.statuses.filter((s) => s.counts_as_present).map((s) => s.code)),
    [session.statuses],
  );

  const visible = session.roster.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (onlyAbsent && presentCodes.has(statuses[item.student_user_id] ?? defaultCode)) return false;
    return true;
  });

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const item of session.roster) {
      const code = statuses[item.student_user_id] ?? defaultCode;
      out[code] = (out[code] ?? 0) + 1;
    }
    return out;
  }, [session.roster, statuses, defaultCode]);

  const pendingChanges = useMemo(() => {
    let count = 0;
    for (const [studentId, value] of Object.entries(statuses)) {
      if (value !== initialValues.statuses[studentId]) count += 1;
    }
    for (const [studentId, value] of Object.entries(notes)) {
      if (value !== initialValues.notes[studentId]) count += 1;
    }
    count += Object.values(violations).filter((value) => value.length > 0).length;
    if (topic !== initialValues.topic) count += 1;
    if (activities !== initialValues.activities) count += 1;
    if (reflection !== initialValues.reflection) count += 1;
    if (reason !== "") count += 1;
    return count;
  }, [activities, initialValues, notes, reason, reflection, statuses, topic, violations]);
  const isDirty = pendingChanges > 0;
  useUnsavedChangesProtection(isDirty && !savedSuccessfully, tEditor("discardChanges"));

  // Hoisted with stable identities (rather than a fresh closure built per
  // row on every render) so an unchanged row's props stay referentially
  // equal and React Compiler can bail it out of re-rendering.
  const handleStatusChange = useCallback((studentId: string, statusCode: string) => {
    setStatuses((prev) => ({ ...prev, [studentId]: statusCode }));
  }, []);

  const handleNoteChange = useCallback((studentId: string, value: string) => {
    setNotes((prev) => ({ ...prev, [studentId]: value }));
  }, []);

  const handleToggleViolation = useCallback((studentId: string, violationTypeId: string) => {
    setViolations((prev) => {
      const current = prev[studentId] ?? EMPTY_VIOLATIONS;
      const next = current.includes(violationTypeId)
        ? current.filter((id) => id !== violationTypeId)
        : [...current, violationTypeId];
      return { ...prev, [studentId]: next };
    });
  }, []);

  const violationTypesData = violationTypes.data?.data ?? EMPTY_VIOLATION_TYPES;

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
      toast.success(t("saved"));
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
    <div className="flex flex-col gap-6 p-4 pb-28 md:p-6 md:pb-28">
      <PageHeader
        eyebrow={t("eyebrow", { meeting: session.meeting_number })}
        title={`${className} ${subjectName}`.trim() || t("title")}
        breadcrumb={[{ label: t("back"), href: "/attendance" }]}
        actions={isCorrection ? <Badge variant="accent">{t("correctionMode")}</Badge> : undefined}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="w-64"
        />
        <label className="flex items-center gap-2 text-[13px]">
          <Switch checked={onlyAbsent} onCheckedChange={setOnlyAbsent} />
          {t("onlyNotPresent")}
        </label>
        <div className="ml-auto flex flex-wrap gap-3 text-[13px]" aria-live="polite">
          {session.statuses.map((s) => (
            <span key={s.code} className="flex items-center gap-1">
              <span className="text-fg-muted">{s.label}</span>
              <span className="font-medium text-fg">{counts[s.code] ?? 0}</span>
            </span>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-border rounded-sm border border-border bg-surface">
        {visible.map((item, index) => {
          const current = statuses[item.student_user_id] ?? defaultCode;
          return (
            <SessionRosterRow
              key={item.student_user_id}
              item={item}
              index={index}
              statuses={session.statuses}
              currentStatus={current}
              note={notes[item.student_user_id] ?? ""}
              violationIds={violations[item.student_user_id] ?? EMPTY_VIOLATIONS}
              violationTypes={violationTypesData}
              violationTypesLoading={violationTypes.isLoading}
              isPresent={presentCodes.has(current)}
              disabled={save.isPending}
              onStatusChange={handleStatusChange}
              onNoteChange={handleNoteChange}
              onToggleViolation={handleToggleViolation}
            />
          );
        })}
        {visible.length === 0 && (
          <li className="px-4 py-6 text-center text-[13px] text-fg-muted">{t("noMatch")}</li>
        )}
      </ul>

      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <h2 className="text-[16px] font-medium text-fg">{t("journalTitle")}</h2>
        {session.previous_journal_topic && (
          <p className="text-[13px] text-fg-muted">
            {t("previousTopic")}: {session.previous_journal_topic}
          </p>
        )}
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("journalTopic")}</span>
          <Input
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
            }}
            disabled={save.isPending}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("journalActivities")}</span>
          <Textarea
            rows={3}
            value={activities}
            onChange={(e) => {
              setActivities(e.target.value);
            }}
            disabled={save.isPending}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("journalReflection")}</span>
          <Textarea
            rows={2}
            value={reflection}
            onChange={(e) => {
              setReflection(e.target.value);
            }}
            disabled={save.isPending}
          />
        </label>
      </section>

      <div className="fixed inset-x-0 bottom-[var(--shell-mobile-tab-offset)] z-(--z-sticky) border-t border-border bg-surface px-4 py-3 md:bottom-0 md:left-[var(--shell-sidebar-width)]">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {isCorrection ? (
            <Input
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              placeholder={t("reasonPlaceholder")}
              aria-label={t("reasonPlaceholder")}
              className="md:w-96"
            />
          ) : (
            <span className="text-[13px] text-fg-muted">
              {isDirty ? tEditor("unsavedChanges", { count: pendingChanges }) : t("saveHint")}
            </span>
          )}
          <div className="flex items-center gap-3">
            {formError && (
              <span role="alert" className="text-[13px] text-status-absent">
                {formError}
              </span>
            )}
            <Button onClick={() => void submit()} loading={save.isPending}>
              {isCorrection ? t("saveCorrection") : t("save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
