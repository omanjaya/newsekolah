"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Alert,
  Avatar,
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
  const [saveSummaries, setSaveSummaries] = useState<SaveSummary[]>([]);

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
        cell: ({ row }) => {
          const name = studentMap.get(row.original.student_user_id)?.name;
          if (!name) return t("unknownStudent");
          return (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar size="sm" name={name} />
              <span className="truncate">{name}</span>
            </div>
          );
        },
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
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      {saveSummaries.length > 0 && (
        <Alert
          variant={saveSummaries.some((s) => s.dueLevels.length > 0) ? "warning" : "info"}
          title={
            saveSummaries.length === 1
              ? t("saveSummaryTitle", {
                  student: saveSummaries[0]?.studentName ?? "",
                  points: saveSummaries[0]?.totalPoints ?? 0,
                })
              : t("saveSummaryTitleMulti", { count: saveSummaries.length })
          }
        >
          <div className="flex flex-col gap-3">
            {saveSummaries.map((summary) => {
              const nextDue = summary.dueLevels[0];
              return (
                <div
                  key={summary.studentId}
                  className="flex flex-col gap-1 border-b border-border/60 pb-2 last:border-0 last:pb-0"
                >
                  {saveSummaries.length > 1 && (
                    <p className="text-[13px] font-medium text-fg">
                      {t("saveSummaryStudentPoints", {
                        student: summary.studentName,
                        points: summary.totalPoints,
                      })}
                    </p>
                  )}
                  {nextDue && (
                    <p>
                      {t("dueLevelBody", {
                        student: summary.studentName,
                        level: nextDue.label,
                        points: nextDue.min_points,
                      })}
                    </p>
                  )}
                  {summary.dueLevels.length > 1 && (
                    <p>
                      {t("dueLevelMore", {
                        levels: summary.dueLevels
                          .slice(1)
                          .map((l) => l.label)
                          .join(", "),
                      })}
                    </p>
                  )}
                  {nextDue && (
                    <div>
                      <Button
                        size="sm"
                        loading={issueLetter.isPending}
                        onClick={() => {
                          issueLetter.mutate(
                            { student_user_id: summary.studentId, level: nextDue.level },
                            {
                              onSuccess: () => {
                                toast.success(t("issueNow"));
                                setSaveSummaries((prev) =>
                                  prev.filter((s) => s.studentId !== summary.studentId),
                                );
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
                    </div>
                  )}
                </div>
              );
            })}
            <div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSaveSummaries([]);
                }}
              >
                {t("dismiss")}
              </Button>
            </div>
          </div>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
          <label className="col-span-2 flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("filters.class")}</span>
            <Select
              options={classOptions}
              value={classId || "all"}
              onValueChange={(v) => {
                setClassId(v === "all" ? "" : v);
              }}
              className="w-full sm:w-44"
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
          <label className="col-span-2 flex min-h-11 items-center gap-2 text-[13px] sm:min-h-0 sm:pb-2">
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

      <div className="flex flex-col md:min-h-0 md:flex-1">
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
          fillHeight
          emptyState={
            <EmptyState
              icon={<domainIcons.violation aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
          }
        />
      </div>

      <Dialog
        open={recording}
        onOpenChange={(open) => {
          setRecording(open);
        }}
      >
        <DialogContent title={t("form.title")}>
          {recording && (
            <ViolationRecordForm
              onDone={(results) => {
                setRecording(false);
                if (results && results.length > 0) {
                  setSaveSummaries(
                    results.map((result) => {
                      const student = studentMap.get(result.record.student_user_id);
                      return {
                        studentId: result.record.student_user_id,
                        studentName: student?.name ?? t("unknownStudent"),
                        totalPoints: result.total_points,
                        dueLevels: [...result.due_levels].sort((a, b) => a.level - b.level),
                      };
                    }),
                  );
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
