"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import {
  Alert,
  type BarcodeScanEvent,
  BarcodeScannerField,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type LateArrivalSummary,
  decodeScanPayload,
  useCurrentLateArrivalQuery,
  useLateArrivalQuery,
  useLateArrivalQueueQuery,
  useOpenLateArrivalMutation,
  useReviewLateArrivalMutation,
  useScanLateArrivalStageMutation,
} from "../api";

import { WorkflowStatusBadge, WorkflowStepper } from "./workflow-stepper";

export function LateArrivalsView(): ReactElement {
  const t = useTranslations("app.permits.late");
  const { me } = useSession();
  // Reviewing a late arrival is scoped server-side to the duty teacher who
  // opened it (or a manage_attendance administrator, per
  // requireLateArrivalReviewer): any teacher can finish one they opened,
  // not only a picket/duty-scheduled teacher, so the queue tab is offered
  // to every teacher and staff account rather than gated by a permission
  // that only some of them hold.
  const canReview = me?.profile_kind === "teacher" || me?.profile_kind === "staff";
  const isStudent = useCan("submit_leave_requests");
  const [tab, setTab] = useUrlState<string>(
    "tab",
    canReview ? ["queue", "mine"] : ["mine"],
    canReview ? "queue" : "mine",
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      {canReview && isStudent ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="queue">{t("tabQueue")}</TabsTrigger>
            <TabsTrigger value="mine">{t("tabMine")}</TabsTrigger>
          </TabsList>
          <TabsContent value="queue" className="pt-4">
            <ReviewQueue />
          </TabsContent>
          <TabsContent value="mine" className="pt-4">
            <MyLateArrival />
          </TabsContent>
        </Tabs>
      ) : canReview ? (
        <ReviewQueue />
      ) : (
        <MyLateArrival />
      )}
    </div>
  );
}

function MyLateArrival(): ReactElement {
  const t = useTranslations("app.permits.late");
  const tScan = useTranslations("app.permits.scan");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const current = useCurrentLateArrivalQuery();
  const open = useOpenLateArrivalMutation();
  const scan = useScanLateArrivalStageMutation();
  const [reason, setReason] = useState("");
  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  if (current.isLoading) return <Skeleton className="h-40 w-full" aria-busy="true" />;
  const detail = current.data;

  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="info" title={t("noneTitle")}>
          {t("noneBody")}
        </Alert>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("reasonLabel")}</span>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            maxLength={500}
          />
        </label>
        <BarcodeScannerField
          label={t("scanDutyLabel")}
          submitLabel={tScan("submit")}
          cameraLabel={tScan("cameraLabel")}
          disabled={open.isPending}
          stretch
          size="large"
          onScan={(event: BarcodeScanEvent) => {
            open.mutate(
              {
                token: decodeScanPayload(event.code).token,
                ...(reason.trim() ? { reason: reason.trim() } : {}),
              },
              {
                onError: fail,
                onSuccess: () => {
                  toast.success(t("opened"));
                },
              },
            );
          }}
        />
      </div>
    );
  }

  const inst = detail.instance;
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-2 text-[13px]">
        <dt className="text-fg-muted">{t("occurrence")}</dt>
        <dd>{t("occurrenceValue", { n: detail.occurrence_number })}</dd>
        <dt className="text-fg-muted">{t("reasonLabel")}</dt>
        <dd>{detail.reason || "-"}</dd>
        <dt className="text-fg-muted">{t("requiredAction")}</dt>
        <dd>{t(`actions.${detail.required_action}`)}</dd>
      </dl>
      <WorkflowStepper instance={inst} />
      {inst.status === "in_progress" && inst.current_stage?.verification === "qr_scan" && (
        <BarcodeScannerField
          label={t("scanStageLabel", { stage: inst.current_stage.label })}
          submitLabel={tScan("submit")}
          cameraLabel={tScan("cameraLabel")}
          disabled={scan.isPending}
          stretch
          size="large"
          onScan={(event: BarcodeScanEvent) => {
            scan.mutate(
              { id: inst.id, token: decodeScanPayload(event.code).token },
              {
                onError: fail,
                onSuccess: () => {
                  toast.success(t("stageDone"));
                },
              },
            );
          }}
        />
      )}
      {inst.status === "in_progress" && inst.current_stage?.verification === "manual" && (
        <p className="text-[13px] text-fg-muted">
          {t("waitManual", { stage: inst.current_stage.label })}
        </p>
      )}
    </div>
  );
}

function ReviewQueue(): ReactElement {
  const t = useTranslations("app.permits.late");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const queue = useLateArrivalQueueQuery();
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const [reviewing, setReviewing] = useState<LateArrivalSummary | null>(null);
  const [search, setSearch] = useState("");
  const items = useMemo(() => queue.data?.data ?? [], [queue.data]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      (studentMap.get(item.student_user_id)?.name ?? "").toLowerCase().includes(query),
    );
  }, [items, search, studentMap]);

  return (
    <div className="flex flex-col gap-4">
      {items.length > 0 && (
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="w-full sm:w-64"
        />
      )}
      {queue.isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.late aria-hidden="true" />}
          title={t("queueEmptyTitle")}
          description={t("queueEmptyBody")}
        />
      ) : visibleItems.length === 0 ? (
        <p className="px-1 py-6 text-center text-[13px] text-fg-muted">{t("noMatch")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleItems.map((item) => {
            const studentName = studentMap.get(item.student_user_id)?.name;
            return (
              <li
                key={item.instance_id}
                className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface px-4 py-2.5 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-medium text-fg">
                    {studentName ? formatDisplayName(studentName) : t("unknownStudent")}
                  </span>
                  <span className="text-[13px] text-fg-muted">
                    {formatDateTime(item.opened_at, { locale, timeZone: me?.tenant.timezone })} ·{" "}
                    {t("occurrenceValue", { n: item.occurrence_number })}
                  </span>
                  {item.reason && <span className="text-[13px]">{item.reason}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <WorkflowStatusBadge status={item.status} />
                  <Button
                    size="sm"
                    onClick={() => {
                      setReviewing(item);
                    }}
                  >
                    {t("review")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog
        open={reviewing !== null}
        onOpenChange={(open) => {
          if (!open) setReviewing(null);
        }}
      >
        <DialogContent title={t("reviewTitle")}>
          {reviewing && (
            <ReviewForm
              item={reviewing}
              onDone={() => {
                setReviewing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewForm({
  item,
  onDone,
}: {
  item: LateArrivalSummary;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.permits.late");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const detail = useLateArrivalQuery(item.instance_id);
  const review = useReviewLateArrivalMutation();
  const [reason, setReason] = useState(item.reason);
  const [homeroomReported, setHomeroomReported] = useState(item.homeroom_reported ?? false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        review.mutate(
          {
            id: item.instance_id,
            reason: reason.trim() || undefined,
            homeroom_reported: homeroomReported,
          },
          {
            onSuccess: () => {
              toast.success(t("reviewed"));
              onDone();
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
      {detail.data && <WorkflowStepper instance={detail.data.instance} />}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("reasonLabel")}</span>
        <Input
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
          maxLength={500}
        />
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <Checkbox
          checked={homeroomReported}
          onCheckedChange={(v) => {
            setHomeroomReported(v === true);
          }}
        />
        {t("homeroomReported")}
      </label>
      <p className="text-[13px] text-fg-muted">{t("reviewHint")}</p>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={review.isPending}>
          {t("submitReview")}
        </Button>
      </div>
    </form>
  );
}
