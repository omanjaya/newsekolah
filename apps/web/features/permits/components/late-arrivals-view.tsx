"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import {
  type BarcodeScanEvent,
  Button,
  Card,
  Checkbox,
  DataList,
  DataListItem,
  DialogFooter,
  EmptyState,
  Field,
  HeroCard,
  Input,
  Scanner,
  type ScannerResultValue,
  Skeleton,
  Textarea,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { ScanLine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import {
  decodeScanPayload,
  type LateArrivalDetail,
  type LateArrivalSummary,
  useCurrentLateArrivalQuery,
  useLateArrivalQuery,
  useOpenLateArrivalMutation,
  useReviewLateArrivalMutation,
  useScanLateArrivalStageMutation,
} from "../api";
import { useCanSubmitPermit } from "../lib/use-can-submit-permit";

import { StageScanDialog } from "./stage-scan-dialog";
import { WorkflowStepper, WorkflowSteps } from "./workflow-stepper";

/**
 * Keterlambatan: a student's own late check-in, scan first. The duty
 * teacher's review queue lives on the duty screen and in the Perlu
 * tindakan inbox, so this view has no queue.
 */
export function LateArrivalsView(): ReactElement {
  const t = useTranslations("app.permits.late");
  const tNav = useTranslations("app.shell.nav.items");
  const canSubmit = useCanSubmitPermit();

  return (
    <AppPage title={t("title")} eyebrow={tNav("permits")}>
      {canSubmit ? (
        <MyLateArrival />
      ) : (
        <EmptyState
          icon={<domainIcons.late aria-hidden="true" />}
          title={t("noAccessTitle")}
          description={t("noAccessBody")}
        />
      )}
    </AppPage>
  );
}

function MyLateArrival(): ReactElement {
  const current = useCurrentLateArrivalQuery();
  if (current.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  return current.data ? <ActiveLateArrival detail={current.data} /> : <LateCheckIn />;
}

/** No late arrival open yet: the camera first, to scan the duty desk's QR. */
function LateCheckIn(): ReactElement {
  const t = useTranslations("app.permits.late");
  const tScan = useTranslations("app.permits.scan");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const open = useOpenLateArrivalMutation();
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ScannerResultValue | null>(null);

  async function handleScan(event: BarcodeScanEvent): Promise<boolean> {
    try {
      await open.mutateAsync({
        token: decodeScanPayload(event.code).token,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      toast.success(t("opened"));
      return true;
    } catch (error) {
      setResult({
        tone: "danger",
        title: tScan("failedTitle"),
        description:
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        key: Date.now(),
      });
      return false;
    }
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <Scanner
        title={t("scanTitle")}
        description={t("scanBody")}
        onScan={handleScan}
        disabled={open.isPending}
        continuous={false}
        manualLabel={t("scanDutyLabel")}
        manualPlaceholder={tScan("placeholder")}
        submitLabel={tScan("submit")}
        result={result}
      >
        <Field label={t("reasonLabel")} hint={t("reasonHint")} optional>
          <Textarea
            rows={2}
            autoResize
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            maxLength={500}
            placeholder={t("reasonPlaceholder")}
          />
        </Field>
      </Scanner>
    </div>
  );
}

/** An open late arrival, as the page's status card: each stage, and the next scan. */
function ActiveLateArrival({ detail }: { detail: LateArrivalDetail }): ReactElement {
  const t = useTranslations("app.permits.late");
  const tWorkflow = useTranslations("app.permits.workflow");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const scan = useScanLateArrivalStageMutation();
  const [scanning, setScanning] = useState(false);
  const inst = detail.instance;
  const stage = inst.current_stage;
  const scanStage = inst.status === "in_progress" && stage?.verification === "qr_scan";

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <HeroCard
        eyebrow={t("hero.eyebrow", { n: detail.occurrence_number })}
        chip={
          stage && inst.status === "in_progress"
            ? tWorkflow("waitingFor", { stage: stage.label })
            : tWorkflow(`status.${inst.status}`)
        }
        live={inst.status === "in_progress"}
        title={t("hero.title", {
          time: formatTime(inst.opened_at, { locale, timeZone: me?.tenant.timezone }),
        })}
        meta={detail.reason || undefined}
        action={
          scanStage ? (
            <Button
              size="lg"
              icon={<ScanLine />}
              className="w-full sm:w-auto"
              onClick={() => {
                setScanning(true);
              }}
            >
              {t("hero.scanStage", { stage: stage.label })}
            </Button>
          ) : undefined
        }
      >
        <Card padding="sm" className="mt-3 text-fg">
          <WorkflowSteps instance={inst} />
          {inst.status === "in_progress" && stage?.verification === "manual" && (
            <p className="text-body-sm text-fg-muted">{t("waitManual", { stage: stage.label })}</p>
          )}
        </Card>
      </HeroCard>
      <Card padding="md">
        <DataList>
          <DataListItem label={t("occurrence")}>
            {t("occurrenceValue", { n: detail.occurrence_number })}
          </DataListItem>
          <DataListItem label={t("requiredAction")}>
            {t(`actions.${detail.required_action}`)}
          </DataListItem>
        </DataList>
      </Card>
      {scanStage && (
        <StageScanDialog
          open={scanning}
          onOpenChange={setScanning}
          title={t("hero.scanStage", { stage: stage.label })}
          description={t("hero.scanHint", { stage: stage.label })}
          manualLabel={t("scanStageLabel", { stage: stage.label })}
          successMessage={t("stageDone")}
          pending={scan.isPending}
          onToken={(token) => scan.mutateAsync({ id: inst.id, token })}
        />
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
      <Field label={t("reasonLabel")}>
        <Input
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
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
      <p className="text-body-sm text-fg-muted">{t("reviewHint")}</p>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={review.isPending}>
          {t("submitReview")}
        </Button>
      </DialogFooter>
    </form>
  );
}
