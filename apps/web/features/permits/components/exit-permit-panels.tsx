"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import {
  Avatar,
  type BarcodeScanEvent,
  EmptyState,
  IconButton,
  List,
  ListRow,
  Scanner,
  SectionHeader,
  type ScannerResultValue,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { formatDisplayName } from "../../../lib/text/format-name";
import { decodeScanPayload, useScanGateMutation } from "../api";

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
 *
 * The typed field is for a keyboard-wedge barcode scanner, which types the
 * whole QR payload (permit and token). The student's gate QR prints no
 * code under it, since the token alone cannot name the permit.
 */
export function GatePanel({ modeSwitch }: { modeSwitch?: ReactNode } = {}): ReactElement {
  const t = useTranslations("app.permits.exit.gate");
  const tScan = useTranslations("app.permits.scan");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  // The generic expired-code copy speaks to a student scanning a teacher's
  // QR. At the gate the guard scans and the student holds the code, so the
  // guard is told to ask the student for a fresh one.
  function gateRefusalText(error: unknown): string {
    if (!(error instanceof ApiError)) return apiErrorMessage("UNKNOWN");
    return error.code === "SCAN_TOKEN_GONE" ? t("tokenGone") : apiErrorMessage(error.code);
  }

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
        description: gateRefusalText(error),
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
        headerEnd={modeSwitch}
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
          <EmptyState
            variant="compact"
            icon={<domainIcons.exitPermit aria-hidden="true" />}
            title={t("todayListEmpty")}
          />
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
