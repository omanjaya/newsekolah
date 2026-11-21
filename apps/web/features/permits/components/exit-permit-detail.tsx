"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime, formatTime } from "@newsekolah/i18n";
import {
  Button,
  Card,
  ConfirmDialog,
  DataList,
  DataListItem,
  Disclosure,
  DisclosureContent,
  DisclosureIndicator,
  DisclosureTrigger,
  HeroCard,
  QrPanel,
  Skeleton,
  SkeletonDetail,
  useToast,
} from "@newsekolah/ui";
import { ScanLine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useBusinessNow } from "../../../lib/simulation/clock";
import { usePeriodsQuery } from "../../reference/api";
import {
  type ExitPermitDetail as ExitPermitDetailData,
  encodeScanPayload,
  useCancelExitPermitMutation,
  useExitPermitQuery,
  useIssueGateTokenMutation,
  useScanExitPermitStageMutation,
} from "../api";
import { exitPermitReadStatus } from "../lib/exit-permit-status";
import { exitReturnState } from "../lib/exit-return";
import { usePermitLessonsOver } from "../lib/use-school-time";

import { ExitedCard, useReturnText } from "./exit-permit-return";
import { StageScanDialog } from "./stage-scan-dialog";
import { WorkflowStepper, WorkflowSteps } from "./workflow-stepper";

/** "Jam 1 sampai Jam 2", from the permit's period ids. */
function usePeriodRange(detail: ExitPermitDetailData | undefined): string | undefined {
  const t = useTranslations("app.permits.exit");
  const periods = usePeriodsQuery();
  if (!detail) return undefined;
  const byId = new Map((periods.data?.data ?? []).map((p) => [p.id, p.name]));
  const from = byId.get(detail.start_period_id);
  const to = byId.get(detail.end_period_id);
  if (!from || !to) return undefined;
  return from === to ? from : t("periodRange", { from, to });
}

function useFail(): (error: unknown) => void {
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  return (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };
}

/**
 * The student's permit on its way, as the page's status card
 * (docs/07-ui-ux.md section 4, "Izin keluar"): where to, which lessons,
 * each stage with when it was done, and one large action for what comes
 * next: scan the approving teacher's QR, then show the gate QR.
 */
export function ActiveExitPermitCard({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.permits.exit");
  const tWorkflow = useTranslations("app.permits.workflow");
  const tQr = useTranslations("app.permits.qr");
  const tScan = useTranslations("app.permits.scan");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const fail = useFail();
  const { data, isLoading, error, refetch } = useExitPermitQuery(id);
  const cancel = useCancelExitPermitMutation();
  const gate = useIssueGateTokenMutation();
  const scan = useScanExitPermitStageMutation();
  const periodRange = usePeriodRange(data);
  const lessonsOver = usePermitLessonsOver(data);
  const now = useBusinessNow();
  const [scanning, setScanning] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const gateQrRef = useRef<HTMLDivElement>(null);
  const gateToken = gate.data?.token;
  // At the gate the QR is all the student needs: bring it into view (above
  // the bottom tab bar on a phone) as soon as it arrives.
  useEffect(() => {
    if (!gateToken) return;
    // A smooth scroll asked for in JS ignores the CSS reduced-motion rule.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gateQrRef.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [gateToken]);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error || !data) return <QueryError retry={refetch} error={error} />;
  const inst = data.instance;
  const stage = inst.current_stage;
  const opened = formatTime(inst.opened_at, { locale, timeZone: me?.tenant.timezone });
  const meta = [periodRange, t("openedAt", { time: opened })].filter(Boolean).join(" · ");

  const timeZone = me?.tenant.timezone;
  if (data.exited_at) {
    return (
      <ExitedCard
        destination={data.destination}
        exitedAt={formatTime(data.exited_at, { locale, timeZone })}
        state={exitReturnState(data, now, timeZone)}
      />
    );
  }

  const approved = inst.status === "approved";
  // Once the permit's lessons are over the API refuses its gate QR and any
  // further stage: say so instead of offering an action that can only fail.
  // A gate QR shown before then goes too, since the gate refuses it now
  // (the card stays mounted while the clock moves past the last lesson).
  const closed = lessonsOver && (approved || inst.status === "in_progress");
  const scanStage =
    inst.status === "in_progress" && stage?.verification === "qr_scan" && !lessonsOver;
  return (
    <HeroCard
      tone={closed ? "neutral" : "accent-soft"}
      // A closed permit says it has ended, as its text below does: not
      // "Siap keluar gerbang" or "Menunggu: Guru piket" over a permit that
      // can go no further.
      eyebrow={
        closed
          ? t("hero.endedEyebrow")
          : approved
            ? t("hero.approvedEyebrow")
            : t("hero.activeEyebrow")
      }
      chip={
        closed
          ? tWorkflow("status.expired")
          : approved
            ? tWorkflow("status.approved")
            : stage
              ? tWorkflow("waitingFor", { stage: stage.label })
              : tWorkflow(`status.${inst.status}`)
      }
      live={!approved && !closed}
      title={data.destination}
      meta={meta}
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
        ) : approved && !gate.data && !lessonsOver ? (
          <Button
            size="lg"
            className="w-full sm:w-auto"
            loading={gate.isPending}
            onClick={() => {
              gate.mutate(id, { onError: fail });
            }}
          >
            {t("showGateQr")}
          </Button>
        ) : undefined
      }
      secondaryAction={
        inst.status === "in_progress" ? (
          <Button
            variant="ghost"
            loading={cancel.isPending}
            onClick={() => {
              setConfirmingCancel(true);
            }}
          >
            {t("cancel")}
          </Button>
        ) : undefined
      }
    >
      {closed && (
        <p className="text-body-sm text-fg-muted">
          {t(approved ? "hero.lessonsOver" : "hero.lessonsOverPending")}
        </p>
      )}
      {approved && gate.data && !lessonsOver && (
        <div ref={gateQrRef} className="mt-3 scroll-mt-4">
          <QrPanel
            size="lg"
            label={t("gateQrLabel")}
            payload={encodeScanPayload("gate", id, gate.data.token)}
            // The gate scanner needs the whole payload (permit and token), so
            // a typed token could never pass; the guard records a student
            // without a working QR by hand instead.
            code=""
            expiresAt={gate.data.expires_at}
            onRenew={() => {
              gate.mutate(id, { onError: fail });
            }}
            renewing={gate.isPending}
            expiredLabel={tQr("expired")}
            expiresInLabel={(seconds) => tQr("expiresIn", { seconds })}
            // The gate pass lasts until the end of the school day: it reads
            // as the time it stops working, on the school's clock.
            expiryDisplay="until"
            validUntilLabel={(expiresAt) =>
              tQr("validUntil", { time: formatTime(expiresAt, { locale, timeZone }) })
            }
            renewLabel={tQr("renew")}
          />
        </div>
      )}
      {approved ? (
        // Every stage is done: one line that opens the stages, so the gate
        // QR stays near the top of a phone screen.
        <Card padding="sm" className="mt-3 text-fg">
          <Disclosure>
            <DisclosureTrigger className="flex min-h-11 w-full items-center gap-2 rounded-md text-label text-fg">
              <DisclosureIndicator />
              {t("stagesApproved", { count: inst.stages.length })}
            </DisclosureTrigger>
            <DisclosureContent className="pt-3">
              <WorkflowSteps instance={inst} />
            </DisclosureContent>
          </Disclosure>
        </Card>
      ) : (
        <Card padding="sm" className="mt-3 text-fg">
          {/* A closed permit's stage reads as where it stopped, not as the
              stage to scan next. */}
          <WorkflowSteps instance={closed ? { ...inst, status: "expired" } : inst} />
          {inst.status === "in_progress" && stage?.verification === "manual" && !closed && (
            <p className="text-body-sm text-fg-muted">{t("waitManual", { stage: stage.label })}</p>
          )}
        </Card>
      )}
      {scanStage && (
        <StageScanDialog
          open={scanning}
          onOpenChange={setScanning}
          title={t("hero.scanStage", { stage: stage.label })}
          description={t("hero.scanHint", { stage: stage.label })}
          manualLabel={t("scanStageLabel", { stage: stage.label })}
          // The last stage approves the permit: point to the gate QR next.
          successMessage={(result) =>
            result.instance.status === "in_progress"
              ? tScan("stageApproved", { stage: stage.label })
              : t("approvedAwaitGate")
          }
          pending={scan.isPending}
          onToken={(token: string) => scan.mutateAsync({ id, token })}
        />
      )}
      <ConfirmDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        tone="danger"
        title={t("cancelConfirm.title")}
        description={t("cancelConfirm.body")}
        confirmLabel={t("cancelConfirm.confirm")}
        cancelLabel={t("cancelConfirm.keep")}
        confirming={cancel.isPending}
        onConfirm={async () => {
          try {
            await cancel.mutateAsync(id);
            toast.success(t("cancelled"));
          } catch (error) {
            fail(error);
          } finally {
            setConfirmingCancel(false);
          }
        }}
      />
    </HeroCard>
  );
}

/** A finished permit from the history, read-only. */
export function ExitPermitDetail({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.permits.exit");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const { data, isLoading, error, refetch } = useExitPermitQuery(id);
  const periodRange = usePeriodRange(data);
  const returnText = useReturnText(data);
  const lessonsOver = usePermitLessonsOver(data);

  if (isLoading) return <SkeletonDetail rows={3} />;
  if (error || !data) return <QueryError retry={refetch} error={error} />;
  const inst = data.instance;
  const timeZone = me?.tenant.timezone;
  // A permit that never reached the gate before its lessons ended reads as
  // expired, as on the student's live card and in the history list. One
  // approved but unused passed every stage: its stages stay approved.
  const status = exitPermitReadStatus(inst.status, lessonsOver);
  const lapsed = status === "expired" && !data.exited_at;
  const unusedApproval = lapsed && data.issued_at !== undefined;
  const stages: typeof inst = { ...inst, status: unusedApproval ? "approved" : status };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <WorkflowStepper instance={stages} status={status} />
        {lapsed && (
          <p className="text-body-sm text-fg-muted">
            {t(unusedApproval ? "endedApprovedNote" : "endedPendingNote")}
          </p>
        )}
      </div>
      <DataList>
        <DataListItem label={t("form.destination")}>{data.destination}</DataListItem>
        <DataListItem label={t("lessons")}>{periodRange}</DataListItem>
        <DataListItem label={t("student")}>
          {data.student_name} ({data.class_name})
        </DataListItem>
        <DataListItem label={t("opened")}>
          {formatDateTime(inst.opened_at, { locale, timeZone })}
        </DataListItem>
        {data.exited_at && (
          <DataListItem label={t("exitedTitle")}>
            {formatDateTime(data.exited_at, { locale, timeZone })}
          </DataListItem>
        )}
        {returnText && <DataListItem label={t("returnLabel")}>{returnText}</DataListItem>}
      </DataList>
    </div>
  );
}
