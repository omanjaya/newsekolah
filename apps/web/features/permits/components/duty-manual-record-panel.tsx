"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Avatar,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  FormActions,
  FormError,
  FormSection,
  Input,
  List,
  ListRow,
  SearchInput,
  SegmentedControl,
  Select,
  SkeletonList,
  Textarea,
  useDebouncedCallback,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { usePeriodsQuery } from "../../reference/api";
import { useDirectoryNames, useDirectorySearch } from "../../reference/directory-names";
import { useRecordExitPermitByStaffMutation, useRecordLateArrivalByStaffMutation } from "../api";

type Kind = "exit" | "late";

const STUDENT_RESULTS = 30;
const SEARCH_DEBOUNCE_MS = 300;

export interface ManualRecord {
  kind: Kind;
  studentName: string;
}

/**
 * The duty teacher's ad-hoc desk/gate record: for a student who is not
 * carrying a phone, search or pick them here instead of relying on their
 * own QR request, choose an exit permit or a late arrival, and record it
 * in one step. The result is an ordinary exit permit or late arrival --
 * same lists, review queues and reports as a self-service one -- with the
 * duty teacher (not the student) as who recorded it.
 */
export function DutyManualRecordPanel({
  onRecorded,
}: {
  onRecorded?: (record: ManualRecord) => void;
} = {}): ReactElement {
  const t = useTranslations("app.duty.manualForm");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const periods = usePeriodsQuery();
  const recordExit = useRecordExitPermitByStaffMutation();
  const recordLate = useRecordLateArrivalByStaffMutation();
  const submitting = recordExit.isPending || recordLate.isPending;

  const [kind, setKind] = useState<Kind>("exit");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const debounceStudentQuery = useDebouncedCallback(setStudentQuery, SEARCH_DEBOUNCE_MS);
  const [studentId, setStudentId] = useState("");
  const [destination, setDestination] = useState("");
  const [startPeriodId, setStartPeriodId] = useState("");
  const [endPeriodId, setEndPeriodId] = useState("");
  const [reason, setReason] = useState("");
  const [homeroomReported, setHomeroomReported] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Search on the server; the picked student's name comes from the cache the
  // search results are written to.
  const found = useDirectorySearch({
    profileKind: "student",
    query: studentQuery,
    limit: STUDENT_RESULTS,
  });
  const visibleStudents = found.data ?? [];
  const studentMap = useDirectoryNames([studentId]);
  const selectedStudent = studentId ? studentMap.get(studentId) : undefined;

  const periodOptions = (periods.data?.data ?? []).map((p) => ({ value: p.id, label: p.name }));

  function resetAfterSuccess() {
    setStudentId("");
    setStudentSearch("");
    setStudentQuery("");
    setDestination("");
    setStartPeriodId("");
    setEndPeriodId("");
    setReason("");
    setHomeroomReported(false);
    setAttempted(false);
  }

  function fail(error: unknown) {
    setFormError(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  function submit() {
    setFormError(null);
    setAttempted(true);
    if (!studentId) return;
    const studentName = studentMap.get(studentId)?.name ?? "";
    if (kind === "exit") {
      if (!destination.trim() || !startPeriodId || !endPeriodId) return;
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
            onRecorded?.({ kind, studentName });
            resetAfterSuccess();
          },
          onError: fail,
        },
      );
      return;
    }
    if (!reason.trim()) return;
    recordLate.mutate(
      { student_user_id: studentId, reason: reason.trim(), homeroom_reported: homeroomReported },
      {
        onSuccess: () => {
          toast.success(t("recordedLate", { student: studentName }));
          onRecorded?.({ kind, studentName });
          resetAfterSuccess();
        },
        onError: fail,
      },
    );
  }

  const required = t("requiredError");
  return (
    <Card padding="md">
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {formError && <FormError>{formError}</FormError>}

        <SegmentedControl<Kind>
          aria-label={t("kindLabel")}
          fullWidth
          options={[
            { value: "exit", label: t("kindExit") },
            { value: "late", label: t("kindLate") },
          ]}
          value={kind}
          onValueChange={setKind}
        />

        <Field
          label={t("student")}
          required
          error={attempted && !studentId ? t("studentRequired") : undefined}
        >
          {(control) =>
            selectedStudent ? (
              <List variant="plain">
                <ListRow
                  leading={<Avatar size={40} name={selectedStudent.name} decorative />}
                  title={selectedStudent.name}
                  selected
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setStudentId("");
                      }}
                    >
                      {t("changeStudent")}
                    </Button>
                  }
                />
              </List>
            ) : (
              <div className="flex flex-col gap-2">
                <SearchInput
                  id={control.id}
                  aria-describedby={control["aria-describedby"]}
                  value={studentSearch}
                  onChange={(e) => {
                    setStudentSearch(e.target.value);
                    debounceStudentQuery(e.target.value.trim());
                  }}
                  placeholder={t("studentSearchPlaceholder")}
                  aria-label={t("studentSearchPlaceholder")}
                />
                <Card tone="sunken" className="max-h-60 overflow-y-auto">
                  {found.isFetching && found.data === undefined ? (
                    <SkeletonList rows={3} leading />
                  ) : visibleStudents.length === 0 ? (
                    <p className="px-4 py-3 text-body-sm text-fg-muted">{t("noStudents")}</p>
                  ) : (
                    <List dense>
                      {visibleStudents.map((student) => (
                        <ListRow
                          key={student.id}
                          leading={<Avatar size={32} name={student.name} decorative />}
                          title={student.name}
                          chevron={false}
                          onClick={() => {
                            setStudentId(student.id);
                          }}
                        />
                      ))}
                    </List>
                  )}
                </Card>
              </div>
            )
          }
        </Field>

        {kind === "exit" ? (
          <FormSection>
            <Field
              label={t("destination")}
              required
              error={attempted && !destination.trim() ? required : undefined}
              className="col-span-full"
            >
              <Input
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                }}
                placeholder={t("destinationPlaceholder")}
                maxLength={500}
              />
            </Field>
            <Field
              label={t("startPeriod")}
              required
              error={attempted && !startPeriodId ? required : undefined}
              hint={periodOptions.length === 0 && !periods.isLoading ? t("noPeriods") : undefined}
            >
              <Select
                options={periodOptions}
                value={startPeriodId}
                onValueChange={setStartPeriodId}
                placeholder={t("selectPeriod")}
              />
            </Field>
            <Field
              label={t("endPeriod")}
              required
              error={attempted && !endPeriodId ? required : undefined}
            >
              <Select
                options={periodOptions}
                value={endPeriodId}
                onValueChange={setEndPeriodId}
                placeholder={t("selectPeriod")}
              />
            </Field>
          </FormSection>
        ) : (
          <div className="flex flex-col gap-4">
            <Field
              label={t("reason")}
              required
              error={attempted && !reason.trim() ? required : undefined}
            >
              <Textarea
                rows={2}
                autoResize
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                }}
                placeholder={t("reasonPlaceholder")}
                maxLength={500}
              />
            </Field>
            <Checkbox
              label={t("homeroomReported")}
              checked={homeroomReported}
              onCheckedChange={(v) => {
                setHomeroomReported(v === true);
              }}
            />
          </div>
        )}

        <p className="text-caption text-fg-muted">{t("recordedHint")}</p>
        <FormActions>
          <Button type="submit" loading={submitting}>
            {t("submit")}
          </Button>
        </FormActions>
      </form>
    </Card>
  );
}
