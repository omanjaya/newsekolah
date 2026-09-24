"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Avatar,
  Button,
  Checkbox,
  Input,
  Select,
  Skeleton,
  Textarea,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery, usePeriodsQuery } from "../../reference/api";
import { useRecordExitPermitByStaffMutation, useRecordLateArrivalByStaffMutation } from "../api";

type Kind = "exit" | "late";

/**
 * The duty teacher's ad-hoc desk/gate record: for a student who is not
 * carrying a phone, search or pick them here instead of relying on their
 * own QR request, choose an exit permit or a late arrival, and record it
 * in one step. The result is an ordinary exit permit or late arrival --
 * same lists, review queues and reports as a self-service one -- with the
 * duty teacher (not the student) as who recorded it.
 */
export function DutyManualRecordPanel(): ReactElement {
  const t = useTranslations("app.duty.manualForm");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const students = useDirectoryQuery("student");
  const periods = usePeriodsQuery();
  const recordExit = useRecordExitPermitByStaffMutation();
  const recordLate = useRecordLateArrivalByStaffMutation();
  const submitting = recordExit.isPending || recordLate.isPending;

  const [kind, setKind] = useState<Kind>("exit");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [destination, setDestination] = useState("");
  const [startPeriodId, setStartPeriodId] = useState("");
  const [endPeriodId, setEndPeriodId] = useState("");
  const [reason, setReason] = useState("");
  const [homeroomReported, setHomeroomReported] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const allStudents = useMemo(() => students.data?.data ?? [], [students.data]);
  const studentMap = useMemo(() => new Map(allStudents.map((s) => [s.id, s])), [allStudents]);
  const visibleStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return allStudents.slice(0, 30);
    return allStudents.filter((s) => s.name.toLowerCase().includes(query)).slice(0, 30);
  }, [allStudents, studentSearch]);
  const selectedStudent = studentId ? studentMap.get(studentId) : undefined;

  const periodOptions = (periods.data?.data ?? []).map((p) => ({ value: p.id, label: p.name }));

  function resetAfterSuccess() {
    setStudentId("");
    setStudentSearch("");
    setDestination("");
    setStartPeriodId("");
    setEndPeriodId("");
    setReason("");
    setHomeroomReported(false);
  }

  function submit() {
    setFormError(null);
    if (!studentId) {
      setFormError(t("requiredError"));
      return;
    }
    const studentName = studentMap.get(studentId)?.name ?? "";
    if (kind === "exit") {
      if (!destination.trim() || !startPeriodId || !endPeriodId) {
        setFormError(t("requiredError"));
        return;
      }
      recordExit.mutate(
        {
          student_user_id: studentId,
          destination: destination.trim(),
          start_period_id: startPeriodId,
          end_period_id: endPeriodId,
        },
        {
          onSuccess: () => {
            toast.success(t("recordedExit", { student: studentName }));
            resetAfterSuccess();
          },
          onError: (error) => {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        },
      );
      return;
    }
    if (!reason.trim()) {
      setFormError(t("requiredError"));
      return;
    }
    recordLate.mutate(
      { student_user_id: studentId, reason: reason.trim(), homeroom_reported: homeroomReported },
      {
        onSuccess: () => {
          toast.success(t("recordedLate", { student: studentName }));
          resetAfterSuccess();
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-[13px] text-fg-muted">{t("intro")}</p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={kind === "exit" ? "primary" : "secondary"}
          icon={<domainIcons.exitPermit />}
          className="flex-1"
          onClick={() => {
            setKind("exit");
          }}
        >
          {t("kindExit")}
        </Button>
        <Button
          type="button"
          variant={kind === "late" ? "primary" : "secondary"}
          icon={<domainIcons.late />}
          className="flex-1"
          onClick={() => {
            setKind("late");
          }}
        >
          {t("kindLate")}
        </Button>
      </div>

      <div className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("student")}</span>
        {selectedStudent ? (
          <div className="flex items-center justify-between gap-2 rounded-sm border border-accent bg-accent/10 px-3 py-2">
            <span className="flex items-center gap-2">
              <Avatar size="sm" name={selectedStudent.name} />
              <span className="text-fg">{selectedStudent.name}</span>
            </span>
            <button
              type="button"
              className="text-[12px] font-medium text-accent"
              onClick={() => {
                setStudentId("");
              }}
            >
              {t("changeStudent")}
            </button>
          </div>
        ) : (
          <>
            <Input
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value);
              }}
              placeholder={t("studentSearchPlaceholder")}
              aria-label={t("studentSearchPlaceholder")}
            />
            <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-sm border border-border p-1">
              {students.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : visibleStudents.length === 0 ? (
                <p className="px-2 py-2 text-fg-muted">{t("noStudents")}</p>
              ) : (
                visibleStudents.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    className="flex min-h-11 items-center gap-2 rounded-xs px-1.5 py-1 text-left hover:bg-bg"
                    onClick={() => {
                      setStudentId(student.id);
                    }}
                  >
                    <Avatar size="sm" name={student.name} />
                    <span className="flex-1 truncate text-fg">{student.name}</span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {kind === "exit" ? (
        <>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("destination")}</span>
            <Input
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
              }}
              placeholder={t("destinationPlaceholder")}
              maxLength={500}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("startPeriod")}</span>
              <Select
                options={periodOptions}
                value={startPeriodId}
                onValueChange={setStartPeriodId}
                placeholder={t("selectPeriod")}
                aria-label={t("startPeriod")}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("endPeriod")}</span>
              <Select
                options={periodOptions}
                value={endPeriodId}
                onValueChange={setEndPeriodId}
                placeholder={t("selectPeriod")}
                aria-label={t("endPeriod")}
              />
            </label>
          </div>
          {periodOptions.length === 0 && !periods.isLoading && (
            <p className="text-[13px] text-fg-muted">{t("noPeriods")}</p>
          )}
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("reason")}</span>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
              placeholder={t("reasonPlaceholder")}
              maxLength={500}
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-[13px]">
            <Checkbox
              checked={homeroomReported}
              onCheckedChange={(v) => {
                setHomeroomReported(v === true);
              }}
            />
            {t("homeroomReported")}
          </label>
        </>
      )}

      {formError && (
        <p role="alert" className="text-[13px] text-status-late">
          {formError}
        </p>
      )}
      <p className="text-[12px] text-fg-muted">{t("recordedHint")}</p>

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" loading={submitting} disabled={!studentId}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
