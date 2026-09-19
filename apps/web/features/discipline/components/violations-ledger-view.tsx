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
import { useRouter } from "next/navigation";
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

/** Shown after a batch of records lands, with the student's new total and any due levels. */
interface SaveSummary {
  studentId: string;
  studentName: string;
  totalPoints: number;
  dueLevels: SPLevel[];
}

export function ViolationsLedgerView(): ReactElement {
  const t = useTranslations("app.discipline.violations");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canRecord = useCan("record_violations");

  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeVoided, setIncludeVoided] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState<ViolationRecord | null>(null);
  const [saveSummary, setSaveSummary] = useState<SaveSummary | null>(null);

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
              onClick={(e) => {
                e.stopPropagation();
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
      {saveSummary && (
        <Alert
          variant={saveSummary.dueLevels.length > 0 ? "warning" : "info"}
          title={t("saveSummaryTitle", {
            student: saveSummary.studentName,
            points: saveSummary.totalPoints,
          })}
        >
          <div className="flex flex-col gap-2">
            {saveSummary.dueLevels[0] && (
              <p>
                {t("dueLevelBody", {
                  student: saveSummary.studentName,
                  level: saveSummary.dueLevels[0].label,
                  points: saveSummary.dueLevels[0].min_points,
                })}
              </p>
            )}
            {saveSummary.dueLevels.length > 1 && (
              <p>
                {t("dueLevelMore", {
                  levels: saveSummary.dueLevels
                    .slice(1)
                    .map((l) => l.label)
                    .join(", "),
                })}
              </p>
            )}
            <div className="flex gap-2">
              {saveSummary.dueLevels[0] && (
                <Button
                  size="sm"
                  loading={issueLetter.isPending}
                  onClick={() => {
                    const nextDue = saveSummary.dueLevels[0];
                    if (!nextDue) return;
                    issueLetter.mutate(
                      { student_user_id: saveSummary.studentId, level: nextDue.level },
                      {
                        onSuccess: () => {
                          toast.success(t("issueNow"));
                          setSaveSummary(null);
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
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSaveSummary(null);
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
        stateKey="features/discipline/components/violations-ledger-view:1"
        mode="local"
        data={items}
        columns={columns}
        rowCount={items.length}
        pagination={{ pageIndex: 0, pageSize: 50 }}
        onPaginationChange={() => undefined}
        sorting={[]}
        onSortingChange={() => undefined}
        globalFilter=""
        isLoading={isLoading}
        getRowId={(item) => item.id}
        onRowActivate={(item) => {
          router.push(`/discipline/students/${item.student_user_id}`);
        }}
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
                if (result) {
                  const student = studentMap.get(result.record.student_user_id);
                  setSaveSummary({
                    studentId: result.record.student_user_id,
                    studentName: student?.name ?? t("unknownStudent"),
                    totalPoints: result.total_points,
                    dueLevels: [...result.due_levels].sort((a, b) => a.level - b.level),
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
