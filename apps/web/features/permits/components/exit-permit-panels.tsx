"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import {
  Avatar,
  Badge,
  type BarcodeScanEvent,
  Button,
  EmptyState,
  List,
  ListRow,
  Scanner,
  SectionHeader,
  type ScannerResultValue,
  SkeletonList,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { LogIn } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { useBusinessNow } from "../../../lib/simulation/clock";
import { todayInZone } from "../../../lib/tenant-date";
import { formatDisplayName } from "../../../lib/text/format-name";
import {
  type ExitPermitAwaitingReturn,
  decodeScanPayload,
  useExitPermitsAwaitingReturnQuery,
  useRecordExitPermitReturnMutation,
  useScanGateMutation,
} from "../api";
import { minutesLate } from "../lib/exit-return";
import { formatShortWeekdayDate } from "../lib/permit-dates";

/**
 * Security: scan the gate QR the student shows, then record the student
 * back. Beside the scanner sits the server's list of today's students who
 * went out and are not back yet, the earliest due first, with the ones
 * past their due time marked late; "Catat kembali" records a return.
 *
 * The typed field is for a keyboard-wedge barcode scanner, which types the
 * whole QR payload (permit and token). The student's gate QR prints no
 * code under it, since the token alone cannot name the permit.
 */
export function GatePanel({ modeSwitch }: { modeSwitch?: ReactNode } = {}): ReactElement {
  const t = useTranslations("app.permits.exit.gate");
  const tScan = useTranslations("app.permits.scan");
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
  const [result, setResult] = useState<ScannerResultValue | null>(null);

  async function handleScan(event: BarcodeScanEvent): Promise<boolean> {
    const { instanceId, token } = decodeScanPayload(event.code);
    if (!instanceId) {
      setResult({ tone: "danger", title: t("needPayload"), key: Date.now() });
      return false;
    }
    try {
      const passed = await scan.mutateAsync({ id: instanceId, token });
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
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
      <AwaitingReturnList />
    </div>
  );
}

/**
 * Today's students out on a permit and not back yet, each with "Catat
 * kembali"; below them, those of the past week whose exit day ended with
 * no return on record, for staff to follow up (their return can no longer
 * be recorded).
 */
function AwaitingReturnList(): ReactElement {
  const t = useTranslations("app.permits.exit.gate");
  const { data, isLoading, isError, refetch } = useExitPermitsAwaitingReturnQuery();
  const all = data?.data ?? [];
  const items = all.filter((item) => !item.unrecorded);
  const unrecorded = all.filter((item) => item.unrecorded);

  return (
    <>
      <section className="flex flex-col gap-3" aria-labelledby="gate-out-title">
        <SectionHeader
          titleId="gate-out-title"
          title={t("outTitle")}
          description={t("outHint")}
          count={items.length}
        />
        {isLoading ? (
          <SkeletonList rows={2} leading framed />
        ) : isError && !data ? (
          <QueryError retry={() => refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            variant="compact"
            icon={<domainIcons.exitPermit aria-hidden="true" />}
            title={t("outEmpty")}
          />
        ) : (
          <List framed>
            {items.map((item) => (
              <AwaitingReturnRow key={item.instance_id} item={item} />
            ))}
          </List>
        )}
      </section>
      {unrecorded.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="gate-unrecorded-title">
          <SectionHeader
            titleId="gate-unrecorded-title"
            title={t("unrecordedTitle")}
            description={t("unrecordedHint")}
            count={unrecorded.length}
          />
          <List framed>
            {unrecorded.map((item) => (
              <UnrecordedReturnRow key={item.instance_id} item={item} />
            ))}
          </List>
        </section>
      )}
    </>
  );
}

/** A past day's exit with no return on record: when, and when the student was due. */
function UnrecordedReturnRow({ item }: { item: ExitPermitAwaitingReturn }): ReactElement {
  const t = useTranslations("app.permits.exit.gate");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;
  return (
    <ListRow
      leading={<Avatar size={40} name={item.student_name} decorative />}
      title={formatDisplayName(item.student_name)}
      titleLines={2}
      meta={[
        item.class_name,
        formatShortWeekdayDate(item.exited_at, locale, timeZone, todayInZone(timeZone)),
        item.expected_return_at
          ? t("dueBack", { time: formatTime(item.expected_return_at, { locale, timeZone }) })
          : t("exitedAt", { time: formatTime(item.exited_at, { locale, timeZone }) }),
      ]}
      keepMetaWhole
      trailing={<Badge tone="warning">{t("unrecordedBadge")}</Badge>}
    />
  );
}

function AwaitingReturnRow({ item }: { item: ExitPermitAwaitingReturn }): ReactElement {
  const t = useTranslations("app.permits.exit.gate");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const record = useRecordExitPermitReturnMutation();
  const now = useBusinessNow();
  const timeZone = me?.tenant.timezone;
  const name = formatDisplayName(item.student_name);
  const late = item.expected_return_at ? minutesLate(item.expected_return_at, now) : 0;

  async function recordReturn() {
    try {
      await record.mutateAsync(item.instance_id);
      toast.success(t("returnedToast", { name }));
    } catch (error) {
      toast.error(apiErrorMessage(error instanceof ApiError ? error.code : "UNKNOWN"));
    }
  }

  return (
    <ListRow
      leading={<Avatar size={40} name={item.student_name} decorative />}
      title={name}
      titleLines={2}
      meta={[
        item.class_name,
        item.expected_return_at
          ? t("dueBack", { time: formatTime(item.expected_return_at, { locale, timeZone }) })
          : t("exitedAt", { time: formatTime(item.exited_at, { locale, timeZone }) }),
      ]}
      keepMetaWhole
      trailing={
        // The server's flag is the decision; the minutes follow the clock
        // on screen between refetches.
        item.overdue || late > 0 ? (
          <Badge tone="danger">{t("overdue", { minutes: Math.max(late, 1) })}</Badge>
        ) : undefined
      }
      action={
        <Button
          size="sm"
          variant="secondary"
          icon={<LogIn />}
          loading={record.isPending}
          aria-label={t("recordReturnFor", { name })}
          onClick={() => void recordReturn()}
        >
          {t("recordReturn")}
        </Button>
      }
    />
  );
}
