"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  type BarcodeScanEvent,
  BarcodeScannerField,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import {
  decodeScanPayload,
  useCurrentLateArrivalQuery,
  useLateArrivalQueueQuery,
  useOpenLateArrivalMutation,
  useScanLateArrivalStageMutation,
} from "../api";

import { ReviewQueue } from "./late-arrival-review-queue";
import { WorkflowStepper } from "./workflow-stepper";

export function LateArrivalsView(): ReactElement {
  const t = useTranslations("app.permits.late");
  const tReview = useTranslations("app.permits.review");
  const { me } = useSession();
  // Reviewing a late arrival is scoped server-side to the duty teacher who
  // opened it (or a manage_attendance administrator, per
  // requireLateArrivalReviewer): any teacher can finish one they opened,
  // not only a picket/duty-scheduled teacher, so the queue tab is offered
  // to every teacher and staff account rather than gated by a permission
  // that only some of them hold.
  const canReview = me?.profile_kind === "teacher" || me?.profile_kind === "staff";
  const isStudent = useCan("submit_leave_requests");
  const showTabs = canReview && isStudent;
  const [tab, setTab] = useUrlState<string>(
    "tab",
    canReview ? ["queue", "mine"] : ["mine"],
    canReview ? "queue" : "mine",
  );

  // Fetched once here, at the view level, rather than inside ReviewQueue:
  // the "Antrean piket" tab label needs the count too, and a second call
  // to the same query hook would double the realtime subscription it
  // opens (features/permits/api.ts's own comment on why that wiring lives
  // in the query hook).
  const queue = useLateArrivalQueueQuery(canReview);
  const queueCount = queue.data?.data.length ?? 0;

  const tabs = showTabs
    ? [
        {
          value: "queue",
          label: tReview("tabWithCount", { label: t("tabQueue"), count: queueCount }),
        },
        { value: "mine", label: t("tabMine") },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {showTabs ? (
        <Tabs value={tab} onValueChange={setTab}>
          <PageHeader
            eyebrow={t("eyebrow")}
            title={t("title")}
            actions={
              <TabsList>
                {tabs.map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            }
          />
          <TabsContent value="queue" className="pt-4">
            <ReviewQueue queue={queue} />
          </TabsContent>
          <TabsContent value="mine" className="pt-4">
            <MyLateArrival />
          </TabsContent>
        </Tabs>
      ) : (
        <>
          <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
          {canReview ? <ReviewQueue queue={queue} /> : <MyLateArrival />}
        </>
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
