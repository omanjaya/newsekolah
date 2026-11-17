"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import {
  Avatar,
  type BarcodeScanEvent,
  Card,
  CardHeader,
  CardTitle,
  DataList,
  DataListItem,
  IconButton,
  List,
  ListRow,
  QrPanel,
  QrPanelSkeleton,
  Scanner,
  SectionHeader,
  type ScannerResultValue,
  useToast,
} from "@newsekolah/ui";
import { Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { formatDisplayName } from "../../../lib/text/format-name";
import {
  decodeScanPayload,
  encodeScanPayload,
  useExitPermitQuery,
  useIssueScanTokenMutation,
  useScanGateMutation,
} from "../api";

import { WorkflowSteps } from "./workflow-stepper";

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
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {/* The permit code is typed (or read by a hardware scanner); the
          student has no QR of their own to show, so no camera here. */}
      <Scanner
        title={t("title")}
        description={t("hint")}
        camera={false}
        manualEntry="open"
        manualLabel={t("permitCode")}
        manualPlaceholder={t("permitCodePlaceholder")}
        submitLabel={t("showQr")}
        onScan={handleScan}
        disabled={issue.isPending}
      />
      {issue.isPending ? (
        <QrPanelSkeleton size="lg" />
      ) : issue.data ? (
        <div className="flex flex-col gap-4">
          <QrPanel
            size="lg"
            label={t("qrLabel")}
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
            <Card padding="md">
              <CardHeader>
                <CardTitle>{formatDisplayName(detail.data.student_name)}</CardTitle>
              </CardHeader>
              <DataList>
                <DataListItem label={t("class")}>{detail.data.class_name}</DataListItem>
                <DataListItem label={t("destination")}>{detail.data.destination}</DataListItem>
              </DataList>
              <WorkflowSteps instance={detail.data.instance} orientation="vertical" />
            </Card>
          )}
        </div>
      ) : null}
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
  const [result, setResult] = useState<ScannerResultValue | null>(null);

  async function handleScan(event: BarcodeScanEvent): Promise<boolean> {
    const { instanceId, token } = decodeScanPayload(event.code);
    if (!instanceId) {
      setResult({ tone: "danger", title: t("needPayload"), key: Date.now() });
      return false;
    }
    try {
      const passed = await scan.mutateAsync({ id: instanceId, token });
      setLog((prev) =>
        [
          {
            key: `${instanceId}:${Date.now()}`,
            studentName: passed.student_name,
            className: passed.class_name,
            at: businessNow().toISOString(),
          },
          ...prev,
        ].slice(0, 20),
      );
      setResult({
        tone: "success",
        title: t("passed"),
        description: `${formatDisplayName(passed.student_name)} (${passed.class_name})`,
        key: Date.now(),
      });
      toast.success(t("passed"));
      return true;
    } catch (error) {
      setResult({
        tone: "danger",
        title: t("refused"),
        description:
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        key: Date.now(),
      });
      return false;
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <Scanner
        title={t("title")}
        description={t("hint")}
        onScan={handleScan}
        disabled={scan.isPending}
        manualLabel={t("payloadLabel")}
        manualPlaceholder={tScan("placeholder")}
        submitLabel={tScan("submit")}
        result={result}
      />
      <section className="flex flex-col gap-3" aria-labelledby="gate-log-title">
        <SectionHeader
          titleId="gate-log-title"
          title={t("todayListTitle")}
          description={t("todayListHint")}
          count={log.length}
        />
        {log.length === 0 ? (
          <p className="text-body-sm text-fg-muted">{t("todayListEmpty")}</p>
        ) : (
          <List framed>
            {log.map((entry, index) => (
              <ListRow
                key={entry.key}
                leading={<Avatar size={40} name={entry.studentName} decorative />}
                title={formatDisplayName(entry.studentName)}
                titleLines={2}
                meta={entry.className}
                trailing={formatTime(entry.at, { locale, timeZone: me?.tenant.timezone })}
                action={
                  index === 0 ? (
                    <IconButton
                      icon={<Undo2 />}
                      aria-label={t("undoLast")}
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLog((prev) => prev.slice(1));
                      }}
                    />
                  ) : undefined
                }
              />
            ))}
          </List>
        )}
      </section>
    </div>
  );
}
