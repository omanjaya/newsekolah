"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import {
  type BarcodeScanEvent,
  BarcodeScannerField,
  IconButton,
  QrPanel,
  useToast,
} from "@newsekolah/ui";
import { Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import {
  decodeScanPayload,
  encodeScanPayload,
  useExitPermitQuery,
  useIssueScanTokenMutation,
  useScanGateMutation,
} from "../api";

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
  const tQr = useTranslations("app.permits.qr");
  const tScan = useTranslations("app.permits.scan");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const issue = useIssueScanTokenMutation();
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

  function handleScan(event: BarcodeScanEvent) {
    const { instanceId, token } = decodeScanPayload(event.code);
    mint(instanceId ?? token);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-fg-muted">{t("hint")}</p>
      {/* The same scanner the piket desk and the library circulation desk
          use elsewhere: hardware scanner, camera, and manual entry all
          funnel through one `onScan` handler. */}
      <BarcodeScannerField
        label={t("permitCode")}
        submitLabel={t("showQr")}
        cameraLabel={tScan("cameraLabel")}
        onScan={handleScan}
        disabled={issue.isPending}
        stretch
        size="large"
      />
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
            expiredLabel={tQr("expired")}
            expiresInLabel={(seconds) => tQr("expiresIn", { seconds })}
            renewLabel={tQr("renew")}
          />
          {detail.data && (
            <div className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4 text-[13px]">
              <span className="text-[15px] font-medium text-fg">
                {formatDisplayName(detail.data.student_name)} ({detail.data.class_name})
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

interface GateLogEntry {
  key: string;
  studentName: string;
  className: string;
  at: string;
}

/**
 * Security: scan the gate QR the student shows. Keeps a session-local
 * "just scanned" list with times (docs' "today's list with times") so the
 * gate can see who has already passed without leaving the screen -- this
 * list lives only in this tab's memory, not the server, so "undo" only
 * hides an entry here; it does not reverse the recorded gate scan.
 */
export function GatePanel(): ReactElement {
  const t = useTranslations("app.permits.exit.gate");
  const tScan = useTranslations("app.permits.scan");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const scan = useScanGateMutation();
  const [log, setLog] = useState<GateLogEntry[]>([]);

  function handleScan(event: BarcodeScanEvent) {
    const { instanceId, token } = decodeScanPayload(event.code);
    if (!instanceId) {
      toast.error(t("needPayload"));
      return;
    }
    scan.mutate(
      { id: instanceId, token },
      {
        onSuccess: (result) => {
          setLog((prev) =>
            [
              {
                key: `${instanceId}:${Date.now()}`,
                studentName: result.student_name,
                className: result.class_name,
                at: new Date().toISOString(),
              },
              ...prev,
            ].slice(0, 20),
          );
          toast.success(t("passed"));
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-fg-muted">{t("hint")}</p>
      <BarcodeScannerField
        label={t("payloadLabel")}
        submitLabel={tScan("submit")}
        cameraLabel={tScan("cameraLabel")}
        onScan={handleScan}
        disabled={scan.isPending}
        stretch
        size="large"
        autoFocus
      />
      {log.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-[13px] font-medium text-fg">{t("todayListTitle")}</h2>
          <ul className="flex flex-col gap-1.5">
            {log.map((entry, index) => (
              <li
                key={entry.key}
                className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface px-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] text-fg">
                    {formatDisplayName(entry.studentName)}{" "}
                    <span className="text-[12px] text-fg-muted">({entry.className})</span>
                  </span>
                  <span className="text-[12px] text-fg-muted">
                    {formatTime(entry.at, { locale, timeZone: me?.tenant.timezone })}
                  </span>
                </div>
                {index === 0 && (
                  <IconButton
                    icon={<Undo2 />}
                    aria-label={t("undoLast")}
                    variant="ghost"
                    onClick={() => {
                      setLog((prev) => prev.slice(1));
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
