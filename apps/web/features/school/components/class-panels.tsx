"use client";
import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Avatar,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  EmptyState,
  IconButton,
  Input,
  Select,
  SearchInput,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { ArrowRightLeft, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useMoveStudentMutation } from "../../academic/api-school-extras";
import { useClassesQuery, useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type Enrollment,
  useBulkAssignMutation,
  useEnrollmentsQuery,
  useUnassignedStudentsQuery,
} from "../api";
export function EnrollmentPanel({
  classId,
  canManage,
}: {
  classId: string;
  canManage: boolean;
}): ReactElement {
  const t = useTranslations("app.school.classes");
  const tApp = useTranslations("app");
  const tCommon = useTranslations("common.states");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const enrollments = useEnrollmentsQuery(classId);
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [rosterSearch, setRosterSearch] = useState("");
  const unassigned = useUnassignedStudentsQuery(search, adding);
  const assign = useBulkAssignMutation(classId);
  const [picked, setPicked] = useState<string[]>([]);
  const rows = (enrollments.data?.data ?? []).filter((e) => e.status === "active");
  const classes = useClassesQuery();
  const moveTargets = (classes.data?.data ?? []).filter((c) => c.id !== classId);
  const moveStudent = useMoveStudentMutation(classId);
  const [moving, setMoving] = useState<Enrollment | null>(null);
  const [toClassId, setToClassId] = useState("");
  const [effectiveOn, setEffectiveOn] = useState(() => new Date().toISOString().slice(0, 10));
  const filteredRows = useMemo(() => {
    const query = rosterSearch.trim().toLocaleLowerCase();
    if (!query) return rows;
    return rows.filter((e) => {
      const name = e.student_name ?? studentMap.get(e.student_user_id)?.name ?? e.student_user_id;
      return name.toLocaleLowerCase().includes(query);
    });
  }, [rosterSearch, rows, studentMap]);
  const fail = (error: unknown) =>
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  return (
    <div className="flex flex-col gap-3 md:h-full md:min-h-0">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-fg-muted">{t("studentCount", { n: rows.length })}</span>
        {canManage && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus />}
            onClick={() => {
              setAdding(true);
            }}
          >
            {t("assignStudents")}
          </Button>
        )}
      </div>
      {!enrollments.isLoading && !enrollments.isError && rows.length > 0 && (
        <SearchInput
          value={rosterSearch}
          onChange={(e) => {
            setRosterSearch(e.target.value);
          }}
          placeholder={t("searchStudent")}
          aria-label={t("searchStudent")}
        />
      )}
      {enrollments.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : enrollments.isError ? (
        <Alert variant="warning" title={tApp("error.body")}>
          <Button variant="secondary" onClick={() => void enrollments.refetch()}>
            {tApp("offlinePage.retry")}
          </Button>
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("noStudents")}
          action={
            canManage && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus />}
                onClick={() => {
                  setAdding(true);
                }}
              >
                {t("assignStudents")}
              </Button>
            )
          }
          className="p-6"
        />
      ) : filteredRows.length === 0 ? (
        <p role="status" className="text-[13px] text-fg-muted">
          {tCommon("noResults")}
        </p>
      ) : (
        <ol className="min-w-0 divide-y divide-border rounded-xs border border-border text-[14px] md:min-h-0 md:flex-1 md:overflow-y-auto">
          {filteredRows.map((e, i) => {
            const name =
              e.student_name ?? studentMap.get(e.student_user_id)?.name ?? e.student_user_id;
            return (
              <li
                key={e.id}
                className="group flex min-w-0 items-center gap-2 px-3 py-2 transition-colors hover:bg-bg"
              >
                <span className="w-6 shrink-0 text-right text-[12px] tabular-nums text-fg-muted">
                  {i + 1}
                </span>
                <Avatar size="sm" name={name} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[14px] md:truncate" title={name}>
                    {name}
                  </p>
                  {e.student_nis && (
                    <p className="tabular-nums text-[12px] text-fg-muted">{e.student_nis}</p>
                  )}
                </div>
                {canManage && (
                  <IconButton
                    icon={<ArrowRightLeft />}
                    aria-label={t("moveStudent")}
                    className="md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-visible:opacity-100"
                    onClick={() => {
                      setMoving(e);
                      setToClassId("");
                    }}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Dialog
        open={adding}
        onOpenChange={(o) => {
          setAdding(o);
          if (!o) setPicked([]);
        }}
      >
        <DialogContent title={t("assignStudents")}>
          <div className="flex flex-col gap-3">
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              placeholder={t("searchStudent")}
              aria-label={t("searchStudent")}
            />
            <div className="max-h-72 overflow-y-auto rounded-xs border border-border">
              {(unassigned.data?.data ?? []).map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 border-b border-border px-3 py-2 text-[14px] last:border-b-0"
                >
                  <Checkbox
                    checked={picked.includes(s.id)}
                    onCheckedChange={() => {
                      setPicked((p) =>
                        p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id],
                      );
                    }}
                  />
                  {s.name} <span className="text-[12px] text-fg-muted">{s.username}</span>
                </label>
              ))}
              {!unassigned.isLoading && (unassigned.data?.data ?? []).length === 0 && (
                <p className="p-3 text-[13px] text-fg-muted">{t("noUnassigned")}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setAdding(false);
                }}
              >
                {t("form.cancel")}
              </Button>
              <Button
                disabled={picked.length === 0}
                loading={assign.isPending}
                onClick={() => {
                  assign.mutate(
                    { student_user_ids: picked, joined_on: new Date().toISOString().slice(0, 10) },
                    {
                      onSuccess: (r) => {
                        toast.success(t("assigned", { n: r.assigned.length }));
                        setAdding(false);
                        setPicked([]);
                      },
                      onError: fail,
                    },
                  );
                }}
              >
                {t("assignCount", { n: picked.length })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={moving !== null}
        onOpenChange={(o) => {
          if (!o) setMoving(null);
        }}
      >
        <DialogContent title={t("moveStudent")}>
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-fg-muted">
              {moving
                ? t("moveBody", {
                    name:
                      moving.student_name ??
                      studentMap.get(moving.student_user_id)?.name ??
                      moving.student_user_id,
                  })
                : ""}
            </p>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("moveTargetClass")}</span>
              <Select
                options={moveTargets.map((c) => ({ value: c.id, label: c.name }))}
                value={toClassId}
                onValueChange={setToClassId}
                placeholder={t("moveTargetPlaceholder")}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("moveEffectiveOn")}</span>
              <Input
                type="date"
                value={effectiveOn}
                onChange={(e) => {
                  setEffectiveOn(e.target.value);
                }}
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setMoving(null);
                }}
              >
                {t("form.cancel")}
              </Button>
              <Button
                disabled={!toClassId}
                loading={moveStudent.isPending}
                onClick={() => {
                  if (!moving) return;
                  moveStudent.mutate(
                    {
                      enrollmentId: moving.id,
                      body: { to_class_id: toClassId, effective_on: effectiveOn },
                    },
                    {
                      onSuccess: () => {
                        toast.success(t("moved"));
                        setMoving(null);
                      },
                      onError: fail,
                    },
                  );
                }}
              >
                {t("moveSubmit")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
// TeachingPanel lives in ./teaching-panel.tsx to keep this file under the
// project's line limit; see api.ts for the same split pattern.
