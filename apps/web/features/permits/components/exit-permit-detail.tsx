"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button, Input, QrPanel, Select, Skeleton, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { usePeriodsQuery } from "../../reference/api";
import {
  decodeScanPayload,
  encodeScanPayload,
  useCancelExitPermitMutation,
  useCreateExitPermitMutation,
  useExitPermitQuery,
  useIssueGateTokenMutation,
  useScanExitPermitStageMutation,
} from "../api";

import { ScanTokenInput } from "./scan-token-input";
import { WorkflowStepper } from "./workflow-stepper";

export function CreateForm({ onDone }: { onDone: (id: string) => void }): ReactElement {
  const t = useTranslations("app.permits.exit.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const periods = usePeriodsQuery();
  const create = useCreateExitPermitMutation();
  const lessons = (periods.data?.data ?? []).filter((p) => !p.is_break);
  const options = lessons.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.starts_at.slice(0, 5)}-${p.ends_at.slice(0, 5)})`,
  }));
  const [destination, setDestination] = useState("");
  const [startId, setStartId] = useState("");
  const [endId, setEndId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!destination.trim() || !startId || !endId) {
      setError(t("requiredError"));
      return;
    }
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

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error && (
        <p role="alert" className="rounded-xs border border-status-late/40 px-3 py-2 text-[13px]">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("destination")}</span>
        <Input
          value={destination}
          maxLength={500}
          onChange={(e) => {
            setDestination(e.target.value);
          }}
          placeholder={t("destinationPlaceholder")}
        />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("from")}</span>
          <Select
            options={options}
            value={startId}
            onValueChange={(v) => {
              setStartId(v);
              if (!endId) setEndId(v);
            }}
            placeholder={t("pick")}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("to")}</span>
          <Select
            options={options}
            value={endId}
            onValueChange={setEndId}
            placeholder={t("pick")}
          />
        </label>
      </div>
      <p className="text-[13px] text-fg-muted">{t("stagesHint")}</p>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="submit" loading={create.isPending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

export function ExitPermitDetail({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.permits.exit");
  const tQr = useTranslations("app.permits.qr");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { data, isLoading } = useExitPermitQuery(id);
  const scan = useScanExitPermitStageMutation();
  const cancel = useCancelExitPermitMutation();
  const gate = useIssueGateTokenMutation();

  if (isLoading || !data) return <Skeleton className="h-64 w-full" aria-busy="true" />;
  const inst = data.instance;
  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-2 text-[13px]">
        <dt className="text-fg-muted">{t("form.destination")}</dt>
        <dd>{data.destination}</dd>
        <dt className="text-fg-muted">{t("student")}</dt>
        <dd>
          {data.student_name} ({data.class_name})
        </dd>
        <dt className="text-fg-muted">{t("code")}</dt>
        <dd>
          <code className="text-[12px]">{inst.id}</code>
        </dd>
      </dl>
      <WorkflowStepper instance={inst} />

      {inst.status === "in_progress" && inst.current_stage?.verification === "qr_scan" && (
        <ScanTokenInput
          label={t("scanStageLabel", { stage: inst.current_stage.label })}
          pending={scan.isPending}
          onSubmit={(raw) => {
            scan.mutate(
              { id, token: decodeScanPayload(raw).token },
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

      {inst.status === "approved" &&
        !data.exited_at &&
        (gate.data ? (
          <QrPanel
            payload={encodeScanPayload("gate", id, gate.data.token)}
            code={gate.data.token}
            expiresAt={gate.data.expires_at}
            onRenew={() => {
              gate.mutate(id, { onError: fail });
            }}
            renewing={gate.isPending}
            expiredLabel={tQr("expired")}
            expiresInLabel={(seconds) => tQr("expiresIn", { seconds })}
            renewLabel={tQr("renew")}
          />
        ) : (
          <Button
            onClick={() => {
              gate.mutate(id, { onError: fail });
            }}
            loading={gate.isPending}
          >
            {t("showGateQr")}
          </Button>
        ))}
      {data.exited_at && <Alert variant="info" title={t("exitedTitle")} />}

      {inst.status === "in_progress" && (
        <div className="flex justify-end border-t border-border pt-4">
          <Button
            variant="ghost"
            size="sm"
            loading={cancel.isPending}
            onClick={() => {
              cancel.mutate(id, {
                onError: fail,
                onSuccess: () => {
                  toast.success(t("cancelled"));
                },
              });
            }}
          >
            {t("cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}
