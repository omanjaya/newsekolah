"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Badge,
  Button,
  Input,
  PageHeader,
  Skeleton,
  Switch,
  Textarea,
  cn,
  useToast,
} from "@newsekolah/ui";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClassesQuery, useLookup, useSubjectsQuery } from "../../reference/api";
import { type SessionDetail, useSaveEntriesMutation, useSessionQuery } from "../api";

/**
 * The teacher's roster grid (docs/07-ui-ux.md section 4): every student
 * defaults to present, one tap changes status, search and an
 * "only not present" toggle keep a class of 36 under 30 seconds. Students
 * locked by an issued leave letter or an active permit show why.
 */
export function SessionView({ sessionId }: { sessionId: string }): ReactElement {
  const t = useTranslations("app.attendance.session");
  const { data, isLoading, error } = useSessionQuery(sessionId);

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-4 p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error) {
    return <Alert variant="warning" title={t("loadError")} className="m-6" />;
  }
  return <SessionEditor key={data.submitted_at ?? "open"} session={data} />;
}

function SessionEditor({ session }: { session: SessionDetail }): ReactElement {
  const t = useTranslations("app.attendance.session");
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

  const isCorrection = Boolean(session.submitted_at);
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
    <div className="flex flex-col gap-6 p-4 pb-28 md:p-6">
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
            <li
              key={item.student_user_id}
              className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 text-right text-[12px] text-fg-muted">{index + 1}</span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] text-fg">{item.name}</span>
                  {item.blocked && (
                    <span className="flex items-center gap-1 text-[12px] text-fg-muted">
                      <Lock className="size-3" aria-hidden="true" />
                      {item.blocked_reason ?? t("blocked")}
                    </span>
                  )}
                  {!item.blocked && item.source && item.source !== "teacher" && (
                    <span className="text-[12px] text-fg-muted">{t(`source.${item.source}`)}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="radiogroup"
                  aria-label={item.name}
                  className="flex rounded-xs border border-border"
                >
                  {session.statuses.map((s) => {
                    const selected = current === s.code;
                    return (
                      <button
                        key={s.code}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={s.label}
                        disabled={item.blocked}
                        onClick={() => {
                          setStatuses((prev) => ({ ...prev, [item.student_user_id]: s.code }));
                        }}
                        className={cn(
                          "min-h-11 min-w-11 px-2 py-2 text-[13px] font-medium first:rounded-l-xs last:rounded-r-xs disabled:opacity-50",
                          selected ? "bg-accent text-accent-fg" : "text-fg hover:bg-bg",
                        )}
                      >
                        {s.code}
                      </button>
                    );
                  })}
                </div>
                {!presentCodes.has(current) && !item.blocked && (
                  <Input
                    value={notes[item.student_user_id] ?? ""}
                    onChange={(e) => {
                      setNotes((prev) => ({ ...prev, [item.student_user_id]: e.target.value }));
                    }}
                    placeholder={t("notePlaceholder")}
                    aria-label={t("noteFor", { name: item.name })}
                    className="w-40"
                  />
                )}
              </div>
            </li>
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
          />
        </label>
      </section>

      <div className="fixed inset-x-0 bottom-16 z-(--z-sticky) border-t border-border bg-surface px-4 py-3 md:bottom-0 md:left-64">
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
            <span className="text-[13px] text-fg-muted">{t("saveHint")}</span>
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
