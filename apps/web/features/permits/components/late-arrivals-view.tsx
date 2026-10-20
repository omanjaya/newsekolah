"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  type BarcodeScanEvent,
  BarcodeScannerField,
  Button,
  Checkbox,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  decodeScanPayload,
  type LateArrivalSummary,
  useCurrentLateArrivalQuery,
  useLateArrivalQuery,
  useOpenLateArrivalMutation,
  useReviewLateArrivalMutation,
  useScanLateArrivalStageMutation,
} from "../api";

import { WorkflowStepper } from "./workflow-stepper";

/**
 * A student's own late-arrival check-in. The duty teacher's review queue
 * lives in the Perlu Tindakan inbox, so this view has no queue tab.
 */
export function LateArrivalsView({ embedded = false }: { embedded?: boolean } = {}): ReactElement {
  const t = useTranslations("app.permits.late");

  return (
    <div className={embedded ? "flex flex-col gap-6" : "flex flex-col gap-6 p-4 md:p-6"}>
      {!embedded && <PageHeader eyebrow={t("eyebrow")} title={t("title")} />}
      <MyLateArrival />
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

export function LateArrivalReviewForm({
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
