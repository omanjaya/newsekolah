"use client";

import { ApiError } from "@newsekolah/api-client";
import { type Locale, formatDate } from "@newsekolah/i18n";
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogContent,
  Input,
  Select,
  Skeleton,
  StatusBadge,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { CalendarClock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { statusToken } from "../../../lib/attendance-status";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { type LeaveRequestSummary, useGuardianLeaveQueueQuery } from "../../permits/api";
import {
  type LeaveCategory,
  type LinkedChild,
  last7Days,
  todayInZone,
  type useChildAttendanceQuery,
  useSubmitChildLeaveRequestMutation,
} from "../api";

import { ATTENDANCE_CODES } from "./child-record-sections";

const LEAVE_CATEGORIES: LeaveCategory[] = ["sick", "religious_ceremony", "dispensation", "other"];
// "This week" also surfaces INCOMPLETE (a day with sessions still unsubmitted,
// not a real attendance status) -- otherwise a week where every day is
// still incomplete would render this section's heading with nothing under it.
const WEEK_CODES = [...ATTENDANCE_CODES, "INCOMPLETE"];

/**
 * The first thing a parent wants answered: is my child OK today. Today's
 * status (shared status colour + text, never colour alone), this week's
 * recap, pending leave requests awaiting this guardian's decision, and a
 * quick way to open a new one -- all reachable without scrolling past the
 * child switcher.
 */
export function TodayCard({
  child,
  attendance,
}: {
  child: LinkedChild;
  attendance: ReturnType<typeof useChildAttendanceQuery>;
}): ReactElement {
  const t = useTranslations("app.family.myChildren.today");
  const tCodes = useTranslations("app.family.myChildren.attendance.codes");
  const canApproveAsGuardian = useCan("approve_child_leave_requests");
  const queue = useGuardianLeaveQueueQuery(canApproveAsGuardian);
  const { me } = useSession();
  const timeZone = me?.tenant.timezone ?? "UTC";
  const today = todayInZone(timeZone);
  const days = attendance.data?.data ?? [];
  const todayEntry = days.find((d) => d.date === today);
  const todayToken = todayEntry ? statusToken(todayEntry.status_code) : undefined;
  const week = last7Days(today).flatMap((date) => {
    const entry = days.find((d) => d.date === date);
    return entry ? [entry] : [];
  });
  const pending = (queue.data?.data ?? []).filter(
    (r) => r.student_user_id === child.student_user_id,
  );
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  return (
    <section className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={formatDisplayName(child.student_name)} />
          <div className="flex flex-col">
            <h2 className="text-[16px] font-medium text-fg">
              {formatDisplayName(child.student_name)}
            </h2>
            {child.class_name && <p className="text-[13px] text-fg-muted">{child.class_name}</p>}
          </div>
        </div>
        {child.can_approve_leave && (
          <Button
            size="sm"
            variant="secondary"
            icon={<CalendarClock />}
            onClick={() => {
              setLeaveDialogOpen(true);
            }}
          >
            {t("submitLeave")}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <span className="text-[13px] font-medium text-fg-muted">{t("todayLabel")}</span>
        {attendance.isLoading ? (
          <Skeleton className="h-6 w-40" />
        ) : todayEntry && todayToken ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={todayToken} label={tCodes(todayEntry.status_code)} />
            <span className="text-[13px] text-fg-muted">
              {t("sessionsRecorded", {
                submitted: todayEntry.submitted_sessions,
                expected: todayEntry.expected_sessions,
              })}
            </span>
          </div>
        ) : (
          <span className="text-[13px] text-fg-muted">{t("noAttendanceToday")}</span>
        )}
      </div>

      {week.some((d) => WEEK_CODES.includes(d.status_code)) && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="text-[13px] font-medium text-fg-muted">{t("thisWeekLabel")}</span>
          <div className="flex flex-wrap gap-3">
            {WEEK_CODES.filter((code) => week.some((d) => d.status_code === code)).map((code) => {
              const count = week.filter((d) => d.status_code === code).length;
              const token = statusToken(code);
              return (
                <span key={code} className="flex items-center gap-1.5 text-[13px]">
                  {token && (
                    <StatusBadge status={token} label={tCodes(code)} className="text-[13px]" />
                  )}
                  <span className="tabular-nums text-fg-muted">{count}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-[13px] font-medium text-fg-muted">{t("pendingLeaveLabel")}</span>
        {canApproveAsGuardian && queue.isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : pending.length === 0 ? (
          <span className="text-[13px] text-fg-muted">{t("pendingLeaveEmpty")}</span>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {pending.map((request) => (
              <PendingLeaveRow key={request.instance_id} request={request} />
            ))}
          </ul>
        )}
      </div>

      {leaveDialogOpen && (
        <ChildLeaveRequestDialog
          child={child}
          onOpenChange={setLeaveDialogOpen}
          onSubmitted={() => {
            void queue.refetch();
          }}
        />
      )}
    </section>
  );
}

function PendingLeaveRow({ request }: { request: LeaveRequestSummary }): ReactElement {
  const t = useTranslations("app.family.myChildren.today");
  const tCategories = useTranslations("app.permits.leave.categories");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;

  return (
    <li className="flex items-center justify-between gap-3 rounded-xs border border-border px-3 py-2 text-[13px]">
      <span className="flex min-w-0 flex-col">
        <span className="text-fg">{tCategories(request.category)}</span>
        <span className="text-fg-muted">
          {formatDate(request.starts_on, { locale, timeZone })} –{" "}
          {formatDate(request.ends_on, { locale, timeZone })}
        </span>
      </span>
      <Badge variant="accent">{t("awaitingYou")}</Badge>
    </li>
  );
}

/** Category, date range, reason -- a few taps from the child's own card. */
function ChildLeaveRequestDialog({
  child,
  onOpenChange,
  onSubmitted,
}: {
  child: LinkedChild;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}): ReactElement {
  const t = useTranslations("app.family.myChildren.today");
  const tForm = useTranslations("app.permits.leave.form");
  const tCategories = useTranslations("app.permits.leave.categories");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const submit = useSubmitChildLeaveRequestMutation(child.student_user_id);
  const [category, setCategory] = useState<LeaveCategory>("sick");
  const [reason, setReason] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const name = formatDisplayName(child.student_name);

  async function send() {
    setError(null);
    if (!reason.trim() || !startsOn || !endsOn) {
      setError(tForm("requiredError"));
      return;
    }
    if (endsOn < startsOn) {
      setError(tForm("rangeError"));
      return;
    }
    try {
      await submit.mutateAsync({
        category,
        reason: reason.trim(),
        starts_on: startsOn,
        ends_on: endsOn,
      });
      toast.success(t("leaveSubmitted", { name }));
      onSubmitted();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        title={t("submitLeaveTitle", { name })}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              loading={submit.isPending}
              onClick={() => {
                void send();
              }}
            >
              {tForm("send")}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {error && (
            <p
              role="alert"
              className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]"
            >
              {error}
            </p>
          )}
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{tForm("category")}</span>
            <Select
              options={LEAVE_CATEGORIES.map((c) => ({ value: c, label: tCategories(c) }))}
              value={category}
              onValueChange={(v) => {
                setCategory(v as LeaveCategory);
              }}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{tForm("startsOn")}</span>
              <Input
                type="date"
                value={startsOn}
                onChange={(e) => {
                  setStartsOn(e.target.value);
                  if (!endsOn) setEndsOn(e.target.value);
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{tForm("endsOn")}</span>
              <Input
                type="date"
                value={endsOn}
                onChange={(e) => {
                  setEndsOn(e.target.value);
                }}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{tForm("reason")}</span>
            <Textarea
              rows={3}
              value={reason}
              maxLength={500}
              onChange={(e) => {
                setReason(e.target.value);
              }}
            />
          </label>
        </form>
      </DialogContent>
    </Dialog>
  );
}
