"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import {
  Alert,
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
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
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

import { ScanTokenInput } from "./scan-token-input";
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
  const [tab, setTab] = useState(canReview ? "queue" : "mine");

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
        <ScanTokenInput
          label={t("scanDutyLabel")}
          pending={open.isPending}
          onSubmit={(raw) => {
            open.mutate(
              {
                token: decodeScanPayload(raw).token,
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
        <ScanTokenInput
          label={t("scanStageLabel", { stage: inst.current_stage.label })}
          pending={scan.isPending}
          onSubmit={(raw) => {
            scan.mutate(
              { id: inst.id, token: decodeScanPayload(raw).token },
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
  const items = queue.data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      {queue.isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.late aria-hidden="true" />}
          title={t("queueEmptyTitle")}
          description={t("queueEmptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.instance_id}
              className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[15px] font-medium text-fg">
                  {studentMap.get(item.student_user_id)?.name ?? t("unknownStudent")}
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
          ))}
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
