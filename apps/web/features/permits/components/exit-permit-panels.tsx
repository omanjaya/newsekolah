"use client";

import { ApiError } from "@newsekolah/api-client";
import { Alert, Button, Input, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  decodeScanPayload,
  encodeScanPayload,
  useExitPermitQuery,
  useIssueScanTokenMutation,
  useScanGateMutation,
} from "../api";

import { QrPanel } from "./qr-panel";
import { ScanTokenInput } from "./scan-token-input";
import { WorkflowStepper } from "./workflow-stepper";

/**
 * Teacher: mint an approve-stage QR for the permit code the student shows.
 * `prefillId` lets the review queue jump straight here for one permit
 * (typing the code by hand is the fallback when a student walks up
 * without having been listed there yet). The caller keys this component on
 * `prefillId` so a new value remounts it with a fresh initial state instead
 * of needing an effect to resynchronize local state from a prop.
 */
export function ApprovePanel({ prefillId }: { prefillId?: string } = {}): ReactElement {
  const t = useTranslations("app.permits.exit.approve");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const issue = useIssueScanTokenMutation();
  const [permitId, setPermitId] = useState(prefillId ?? "");
  const detail = useExitPermitQuery(issue.data?.context_id ?? "");

  function mint(id: string) {
    issue.mutate(
      { purpose: "approve_stage", context_id: id },
      {
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  useEffect(() => {
    if (prefillId) mint(prefillId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mint once on mount; the key remount covers a changed prefillId
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-fg-muted">{t("hint")}</p>
      <form
        className="flex flex-col gap-2 md:flex-row md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const { instanceId, token } = decodeScanPayload(permitId);
          mint(instanceId ?? token);
        }}
      >
        <label className="flex flex-1 flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("permitCode")}</span>
          <Input
            value={permitId}
            onChange={(e) => {
              setPermitId(e.target.value);
            }}
            spellCheck={false}
          />
        </label>
        <Button type="submit" loading={issue.isPending} disabled={!permitId.trim()}>
          {t("showQr")}
        </Button>
      </form>
      {issue.data && (
        <div className="grid gap-4 md:grid-cols-2">
          <QrPanel
            payload={encodeScanPayload("approve", issue.data.context_id ?? "", issue.data.token)}
            code={issue.data.token}
            expiresAt={issue.data.expires_at}
            onRenew={() => {
              if (issue.data.context_id) mint(issue.data.context_id);
            }}
            renewing={issue.isPending}
          />
          {detail.data && (
            <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4 text-[13px]">
              <span className="text-[15px] font-medium text-fg">
                {detail.data.student_name} ({detail.data.class_name})
              </span>
              <span>{detail.data.destination}</span>
              <WorkflowStepper instance={detail.data.instance} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Security: scan the gate QR the student shows. */
export function GatePanel(): ReactElement {
  const t = useTranslations("app.permits.exit.gate");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const scan = useScanGateMutation();
  const [last, setLast] = useState<{ name: string; className: string } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-fg-muted">{t("hint")}</p>
      <ScanTokenInput
        label={t("payloadLabel")}
        pending={scan.isPending}
        onSubmit={(raw) => {
          const { instanceId, token } = decodeScanPayload(raw);
          if (!instanceId) {
            toast.error(t("needPayload"));
            return;
          }
          scan.mutate(
            { id: instanceId, token },
            {
              onSuccess: (detail) => {
                setLast({ name: detail.student_name, className: detail.class_name });
                toast.success(t("passed"));
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
      />
      {last && (
        <Alert variant="info" title={t("lastTitle")}>
          {last.name} ({last.className})
        </Alert>
      )}
    </div>
  );
}
