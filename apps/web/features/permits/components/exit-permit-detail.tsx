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
  DialogFooter,
  Field,
  FormError,
  FormSection,
  HeroCard,
  Input,
  QrPanel,
  Select,
  Skeleton,
  SkeletonDetail,
  useToast,
} from "@newsekolah/ui";
import { ScanLine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { usePeriodsQuery } from "../../reference/api";
import { clockRange } from "../../schedule/clock-label";
import {
  type ExitPermitDetail as ExitPermitDetailData,
  encodeScanPayload,
  useCancelExitPermitMutation,
  useCreateExitPermitMutation,
  useExitPermitQuery,
  useIssueGateTokenMutation,
  useScanExitPermitStageMutation,
} from "../api";

import { StageScanDialog } from "./stage-scan-dialog";
import { WorkflowStepper, WorkflowSteps } from "./workflow-stepper";

export function CreateForm({
  onDone,
  onCancel,
}: {
  onDone: (id: string) => void;
  onCancel?: () => void;
}): ReactElement {
  const t = useTranslations("app.permits.exit.form");
  const locale = useLocale();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const periods = usePeriodsQuery();
  const create = useCreateExitPermitMutation();
  const lessons = (periods.data?.data ?? []).filter((p) => !p.is_break);
  const options = lessons.map((p) => ({
    value: p.id,
    label: `${p.name} (${clockRange(p.starts_at, p.ends_at, locale)})`,
  }));
  const [destination, setDestination] = useState("");
  const [startId, setStartId] = useState("");
  const [endId, setEndId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  async function submit() {
    setError(null);
    setAttempted(true);
    if (!destination.trim() || !startId || !endId) return;
    try {
      const detail = await create.mutateAsync({
        destination: destination.trim(),
        start_period_id: startId,
        end_period_id: endId,
      });
      toast.success(t("created"));
      onDone(detail.instance.id);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"));
    }
  }

  const required = t("required");
  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && <FormError>{error}</FormError>}
      <FormSection>
        <Field
          label={t("destination")}
          error={attempted && !destination.trim() ? required : undefined}
          required
          className="col-span-full"
        >
          <Input
            value={destination}
            maxLength={500}
            onChange={(e) => {
              setDestination(e.target.value);
            }}
            placeholder={t("destinationPlaceholder")}
          />
        </Field>
        <Field label={t("from")} error={attempted && !startId ? required : undefined} required>
          <Select
            options={options}
            value={startId}
            onValueChange={(v) => {
              setStartId(v);
              if (!endId) setEndId(v);
            }}
            placeholder={t("pick")}
          />
        </Field>
        <Field label={t("to")} error={attempted && !endId ? required : undefined} required>
          <Select
            options={options}
            value={endId}
            onValueChange={setEndId}
            placeholder={t("pick")}
          />
        </Field>
      </FormSection>
      <p className="text-body-sm text-fg-muted">{t("stagesHint")}</p>
      <DialogFooter>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
        <Button type="submit" loading={create.isPending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

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
  const [scanning, setScanning] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error || !data) return <QueryError retry={refetch} error={error} />;
  const inst = data.instance;
  const stage = inst.current_stage;
  const opened = formatTime(inst.opened_at, { locale, timeZone: me?.tenant.timezone });
  const meta = [periodRange, t("openedAt", { time: opened })].filter(Boolean).join(" · ");

  if (data.exited_at) {
    return (
      <HeroCard
        tone="neutral"
        eyebrow={t("hero.exitedEyebrow")}
        title={data.destination}
        meta={t("hero.exitedAt", {
          time: formatTime(data.exited_at, { locale, timeZone: me?.tenant.timezone }),
        })}
      />
    );
  }

  const approved = inst.status === "approved";
  const scanStage = inst.status === "in_progress" && stage?.verification === "qr_scan";
  return (
    <HeroCard
      eyebrow={approved ? t("hero.approvedEyebrow") : t("hero.activeEyebrow")}
      chip={
        approved
          ? tWorkflow("status.approved")
          : stage
            ? tWorkflow("waitingFor", { stage: stage.label })
            : tWorkflow(`status.${inst.status}`)
      }
      live={!approved}
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
        ) : approved && !gate.data ? (
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
      <Card padding="sm" className="mt-3 text-fg">
        <WorkflowSteps instance={inst} />
        {inst.status === "in_progress" && stage?.verification === "manual" && (
          <p className="text-body-sm text-fg-muted">{t("waitManual", { stage: stage.label })}</p>
        )}
      </Card>
      {approved && gate.data && (
        <QrPanel
          className="mt-3"
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
          renewLabel={tQr("renew")}
        />
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

  if (isLoading) return <SkeletonDetail rows={3} />;
  if (error || !data) return <QueryError retry={refetch} error={error} />;
  const inst = data.instance;
  const timeZone = me?.tenant.timezone;

  return (
    <div className="flex flex-col gap-5">
      <WorkflowStepper instance={inst} />
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
      </DataList>
    </div>
  );
}
