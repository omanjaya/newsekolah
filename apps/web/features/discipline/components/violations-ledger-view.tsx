"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  DataTable,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  Select,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useClassesQuery, useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type SPLevel,
  type ViolationRecord,
  useIssueWarningLetterMutation,
  useViolationsQuery,
} from "../api";

import { ViolationRecordForm } from "./violation-record-form";
import { ViolationVoidDialog } from "./violation-void-dialog";

/** Shown after a record pushes the student's total past a warning-letter threshold. */
interface DuePrompt {
  studentId: string;
  studentName: string;
  level: SPLevel;
}

export function ViolationsLedgerView(): ReactElement {
  const t = useTranslations("app.discipline.violations");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canRecord = useCan("record_violations");

  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeVoided, setIncludeVoided] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState<ViolationRecord | null>(null);
  const [duePrompt, setDuePrompt] = useState<DuePrompt | null>(null);

  const classes = useClassesQuery();
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const { data, isLoading } = useViolationsQuery({ classId, from, to, includeVoided });
  const issueLetter = useIssueWarningLetterMutation();

  const items = data?.data ?? [];
  const classOptions = [
    { value: "all", label: t("filters.classAll") },
    ...(classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  const columns = useMemo<ColumnDef<ViolationRecord>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        cell: ({ row }) =>
          studentMap.get(row.original.student_user_id)?.name ?? t("unknownStudent"),
      },
      {
        id: "type",
        header: t("columns.type"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.original.type_name}</span>
            {row.original.notes && (
              <span className="text-[12px] text-fg-muted">{row.original.notes}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "points",
        header: t("columns.points"),
        enableSorting: false,
      },
      {
        id: "date",
        header: t("columns.date"),
        enableSorting: false,
        cell: ({ row }) => formatDate(row.original.occurred_on, { locale }),
      },
      {
        id: "status",
        header: t("columns.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.is_voided ? "neutral" : "accent"}>
            {t(row.original.is_voided ? "status.voided" : "status.active")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canRecord && !row.original.is_voided ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setVoiding(row.original);
              }}
            >
              {t("void")}
            </Button>
          ) : null,
      },
    ],
    [t, locale, studentMap, canRecord],
  );

  return (
    <div className="flex flex-col gap-4">
      {duePrompt && (
        <Alert variant="warning" title={t("dueLevelTitle")}>
          <div className="flex flex-col gap-2">
            <p>
              {t("dueLevelBody", {
                student: duePrompt.studentName,
                level: duePrompt.level.label,
                points: duePrompt.level.min_points,
              })}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                loading={issueLetter.isPending}
                onClick={() => {
                  issueLetter.mutate(
                    { student_user_id: duePrompt.studentId, level: duePrompt.level.level },
                    {
                      onSuccess: () => {
                        toast.success(t("issueNow"));
                        setDuePrompt(null);
                      },
                      onError: (error) => {
                        toast.error(
                          error instanceof ApiError
                            ? apiErrorMessage(error.code)
                            : apiErrorMessage("UNKNOWN"),
                        );
                      },
                    },
                  );
                }}
              >
                {t("issueNow")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setDuePrompt(null);
                }}
              >
                {t("dismiss")}
              </Button>
            </div>
          </div>
        </Alert>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("filters.class")}</span>
            <Select
              options={classOptions}
              value={classId || "all"}
              onValueChange={(v) => {
                setClassId(v === "all" ? "" : v);
              }}
              className="w-44"
              aria-label={t("filters.class")}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("filters.from")}</span>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("filters.to")}</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
              }}
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-[13px]">
            <Checkbox
              checked={includeVoided}
              onCheckedChange={(v) => {
                setIncludeVoided(v === true);
              }}
            />
            {t("filters.includeVoided")}
          </label>
        </div>
        {canRecord && (
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => {
              setRecording(true);
            }}
          >
            {t("record")}
          </Button>
        )}
      </div>

      <DataTable
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        onGlobalFilterChange={() => undefined}
        isLoading={isLoading}
        getRowId={(item) => item.id}
        emptyState={
          <EmptyState
            icon={<domainIcons.violation aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        }
      />

      <Dialog
        open={recording}
        onOpenChange={(open) => {
          setRecording(open);
        }}
      >
        <DialogContent title={t("form.title")}>
          {recording && (
            <ViolationRecordForm
              onDone={(result) => {
                setRecording(false);
                const nextDue = result?.due_levels[0];
                if (result && nextDue) {
                  const student = studentMap.get(result.record.student_user_id);
                  setDuePrompt({
                    studentId: result.record.student_user_id,
                    studentName: student?.name ?? t("unknownStudent"),
                    level: nextDue,
                  });
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ViolationVoidDialog
        record={voiding}
        studentName={
          voiding ? (studentMap.get(voiding.student_user_id)?.name ?? t("unknownStudent")) : ""
        }
        onOpenChange={(open) => {
          if (!open) setVoiding(null);
        }}
      />
    </div>
  );
}
