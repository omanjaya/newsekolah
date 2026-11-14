"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Checkbox,
  DatePicker,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  List,
  SearchInput,
  Select,
  SkeletonList,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useMoveStudentMutation, useRemoveStudentMutation } from "../../academic/api-school-extras";
import { todayInZone } from "../../attendance/api";
import { useClassesQuery } from "../../reference/api";
import { type Enrollment, useBulkAssignMutation, useUnassignedStudentsQuery } from "../api";

/** A roster row as the dialogs name it. */
export interface RosterStudent {
  enrollment: Enrollment;
  name: string;
}

function useFail(): (error: unknown) => void {
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  return (error) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };
}

/**
 * Runs one enrollment change per student, one after another so the
 * server sees the same requests a single change sends, and reports how
 * many went through. The first failure is shown; the rest still run.
 */
async function runForEach(
  students: RosterStudent[],
  change: (enrollment: Enrollment) => Promise<unknown>,
  fail: (error: unknown) => void,
): Promise<number> {
  let done = 0;
  let firstError: unknown;
  for (const student of students) {
    try {
      await change(student.enrollment);
      done += 1;
    } catch (error) {
      firstError ??= error;
    }
  }
  if (firstError !== undefined) fail(firstError);
  return done;
}

/** Names one student, or counts several, for a dialog's sentence. */
function subjectOf(
  students: RosterStudent[],
  t: ReturnType<typeof useTranslations<"app.school.classes">>,
) {
  return students.length === 1
    ? (students[0]?.name ?? "")
    : t("selectedStudents", { n: students.length });
}

/** Unassigned students of the year, picked with checkboxes and placed in the class in one request. */
export function AssignStudentsDialog({
  classId,
  open,
  onOpenChange,
}: {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.school.classes");
  const { me } = useSession();
  const toast = useToast();
  const fail = useFail();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const unassigned = useUnassignedStudentsQuery(search, open);
  const assign = useBulkAssignMutation(classId);
  const candidates = unassigned.data?.data ?? [];
  const allPicked = candidates.length > 0 && candidates.every((s) => picked.includes(s.id));
  const close = () => {
    onOpenChange(false);
    setPicked([]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent
        title={t("assignStudents")}
        description={t("assignBody")}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t("form.cancel")}
            </Button>
            <Button
              disabled={picked.length === 0}
              loading={assign.isPending}
              onClick={() => {
                assign.mutate(
                  { student_user_ids: picked, joined_on: todayInZone(me?.tenant.timezone) },
                  {
                    onSuccess: (result) => {
                      toast.success(t("assigned", { n: result.assigned.length }));
                      close();
                    },
                    onError: fail,
                  },
                );
              }}
            >
              {t("assignCount", { n: picked.length })}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <SearchInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder={t("searchStudent")}
            aria-label={t("searchStudent")}
          />
          {candidates.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-1">
              <Checkbox
                checked={allPicked || (picked.length > 0 && "indeterminate")}
                onCheckedChange={(value) => {
                  setPicked(value === true ? candidates.map((s) => s.id) : []);
                }}
                label={t("pickAll")}
              />
              <span className="text-caption text-fg-muted tabular-nums">
                {t("pickedCount", { n: picked.length })}
              </span>
            </div>
          )}
          {unassigned.isLoading ? (
            <SkeletonList rows={4} />
          ) : candidates.length === 0 ? (
            <EmptyState
              variant="inline"
              icon={<domainIcons.users aria-hidden="true" />}
              title={t("noUnassigned")}
            />
          ) : (
            <List framed dense variant="divided" className="max-h-72 overflow-y-auto">
              {candidates.map((student) => (
                <li key={student.id} className="flex min-h-11 items-center px-4 py-2">
                  <Checkbox
                    checked={picked.includes(student.id)}
                    onCheckedChange={() => {
                      setPicked((previous) =>
                        previous.includes(student.id)
                          ? previous.filter((id) => id !== student.id)
                          : [...previous, student.id],
                      );
                    }}
                    label={student.name}
                    description={student.username}
                  />
                </li>
              ))}
            </List>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Moves one or more students of the roster to another class from a date. */
export function MoveStudentsDialog({
  classId,
  students,
  onClose,
  onDone,
}: {
  classId: string;
  /** Who moves; an empty list keeps the dialog closed. */
  students: RosterStudent[];
  onClose: () => void;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.school.classes");
  const { me } = useSession();
  const toast = useToast();
  const fail = useFail();
  const classes = useClassesQuery();
  const move = useMoveStudentMutation(classId);
  const [toClassId, setToClassId] = useState("");
  const [effectiveOn, setEffectiveOn] = useState(() => todayInZone(me?.tenant.timezone));
  const [running, setRunning] = useState(false);
  const targets = (classes.data?.data ?? []).filter((c) => c.id !== classId);
  const open = students.length > 0;

  async function submit() {
    setRunning(true);
    const done = await runForEach(
      students,
      (enrollment) =>
        move.mutateAsync({
          enrollmentId: enrollment.id,
          body: { to_class_id: toClassId, effective_on: effectiveOn },
        }),
      fail,
    );
    setRunning(false);
    if (done > 0) {
      toast.success(students.length === 1 ? t("moved") : t("movedCount", { n: done }));
      setToClassId("");
      onDone();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        title={t("moveStudent")}
        description={open ? t("moveBody", { name: subjectOf(students, t) }) : undefined}
        size="md"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={t("moveTargetClass")} required>
            <Select
              options={targets.map((c) => ({ value: c.id, label: c.name }))}
              value={toClassId}
              onValueChange={setToClassId}
              placeholder={t("moveTargetPlaceholder")}
            />
          </Field>
          <Field label={t("moveEffectiveOn")} required>
            <DatePicker
              value={effectiveOn}
              onChange={setEffectiveOn}
              today={todayInZone(me?.tenant.timezone)}
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              {t("form.cancel")}
            </Button>
            <Button type="submit" disabled={!toClassId || !effectiveOn} loading={running}>
              {t("moveSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Marks one or more students as having left the school on a date. */
export function LeaveStudentsDialog({
  classId,
  students,
  onClose,
  onDone,
}: {
  classId: string;
  students: RosterStudent[];
  onClose: () => void;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.school.classes");
  const { me } = useSession();
  const toast = useToast();
  const fail = useFail();
  const remove = useRemoveStudentMutation(classId);
  const [leftOn, setLeftOn] = useState(() => todayInZone(me?.tenant.timezone));
  const [running, setRunning] = useState(false);
  const open = students.length > 0;

  async function submit() {
    setRunning(true);
    const done = await runForEach(
      students,
      (enrollment) =>
        remove.mutateAsync({ enrollmentId: enrollment.id, body: { left_on: leftOn } }),
      fail,
    );
    setRunning(false);
    if (done > 0) {
      toast.success(students.length === 1 ? t("studentLeft") : t("leftCount", { n: done }));
      onDone();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        title={t("leaveStudent")}
        description={open ? t("leaveBody", { name: subjectOf(students, t) }) : undefined}
        size="md"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field label={t("leaveOn")} required>
            <DatePicker
              value={leftOn}
              onChange={setLeftOn}
              today={todayInZone(me?.tenant.timezone)}
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              {t("form.cancel")}
            </Button>
            <Button type="submit" variant="danger" disabled={!leftOn} loading={running}>
              {t("leaveSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
