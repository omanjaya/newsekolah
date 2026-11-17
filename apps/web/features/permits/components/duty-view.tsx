"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CountBadge,
  Dialog,
  DialogContent,
  EmptyState,
  List,
  ListRow,
  QrPanel,
  QrPanelSkeleton,
  SegmentedControl,
  SkeletonList,
  TextLink,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { MonitorPlay } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  type LateArrivalSummary,
  type ScanPurpose,
  encodeScanPayload,
  useIssueScanTokenMutation,
  useLateArrivalQueueQuery,
} from "../api";

import { type ManualRecord, DutyManualRecordPanel } from "./duty-manual-record-panel";
import { ApprovePanel } from "./exit-permit-panels";
import { LateArrivalReviewForm } from "./late-arrivals-view";

const MODES = ["classroom_entry", "late_arrival", "exit", "manual"] as const;
type DutyMode = (typeof MODES)[number];

interface DeskLogEntry {
  key: string;
  kind: "exit" | "late" | "review";
  studentName: string;
  at: string;
}

/**
 * Piket hari ini (docs/07-ui-ux.md section 4, "Guru piket"): one screen, no
 * menu diving. The QR for the chosen mode comes first and large, with its
 * countdown; the late arrivals waiting for review and what was recorded at
 * this desk today sit beside it on a laptop and under it on a phone. Each QR
 * is a single-use token that renews itself when it expires.
 */
export function DutyView(): ReactElement {
  const t = useTranslations("app.duty");
  const tNav = useTranslations("app.shell.nav.items");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const canMonitor = useCan("view_monitor_presence");
  const [mode, setMode] = useUrlState<DutyMode>("mode", MODES, "classroom_entry");
  const [log, setLog] = useState<DeskLogEntry[]>([]);
  const today = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: me?.tenant.timezone,
  }).format(businessNow());

  function remember(kind: DeskLogEntry["kind"], studentName: string) {
    setLog((prev) =>
      [
        { key: `${kind}:${Date.now()}`, kind, studentName, at: businessNow().toISOString() },
        ...prev,
      ].slice(0, 30),
    );
  }

  return (
    <AppPage
      variant="wide"
      title={t("title")}
      eyebrow={tNav("duty")}
      description={today}
      nav={false}
      secondaryActions={
        canMonitor
          ? [
              {
                label: t("openMonitor"),
                icon: <MonitorPlay />,
                onSelect: () => {
                  window.open("/monitor", "_blank", "noopener,noreferrer");
                },
              },
            ]
          : undefined
      }
      toolbar={
        <SegmentedControl
          aria-label={t("modeLabel")}
          options={MODES.map((value) => ({ value, label: t(`purposes.${value}`) }))}
          value={mode}
          onValueChange={setMode}
          className="w-full sm:w-auto sm:self-start"
        />
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {mode === "manual" ? (
            <DutyManualRecordPanel
              onRecorded={(record: ManualRecord) => {
                remember(record.kind, record.studentName);
              }}
            />
          ) : mode === "exit" ? (
            <ApprovePanel />
          ) : (
            <PurposePanel key={mode} purpose={mode} />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <LateQueue
            onReviewed={(name) => {
              remember("review", name);
            }}
          />
          <DeskLog entries={log} locale={locale} timeZone={me?.tenant.timezone} />
        </div>
      </div>
    </AppPage>
  );
}

function PurposePanel({ purpose }: { purpose: ScanPurpose }): ReactElement {
  const t = useTranslations("app.duty");
  const tQr = useTranslations("app.permits.qr");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const issue = useIssueScanTokenMutation();

  useEffect(() => {
    issue.mutate({ purpose });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mint once per purpose on mount
  }, [purpose]);

  function renew() {
    issue.mutate(
      { purpose },
      {
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {issue.data ? (
        <QrPanel
          size="lg"
          autoRenew
          label={t(`qrLabel.${purpose}`)}
          payload={encodeScanPayload(purpose, "", issue.data.token)}
          // The raw token is 43 characters: nobody types that. A student
          // without a camera is recorded by hand under "Catat manual".
          code=""
          expiresAt={issue.data.expires_at}
          onRenew={renew}
          renewing={issue.isPending}
          expiredLabel={tQr("expired")}
          expiresInLabel={(seconds) => tQr("expiresIn", { seconds })}
          renewLabel={tQr("renew")}
        />
      ) : issue.isError ? (
        <QueryError retry={renew} error={issue.error} />
      ) : (
        <QrPanelSkeleton size="lg" />
      )}
      <p className="text-body-sm text-fg-muted">{t(`help.${purpose}`)}</p>
    </div>
  );
}

/** Late arrivals waiting for this duty teacher, with one tap to review each. */
function LateQueue({ onReviewed }: { onReviewed: (studentName: string) => void }): ReactElement {
  const t = useTranslations("app.duty.queue");
  const tLate = useTranslations("app.permits.late");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const canLate = me?.profile_kind === "teacher" || me?.profile_kind === "staff";
  const queue = useLateArrivalQueueQuery(canLate);
  const items = queue.data?.data ?? [];
  const names = useDirectoryNames(
    items.map((item) => item.student_user_id),
    canLate,
  );
  const [reviewing, setReviewing] = useState<LateArrivalSummary | null>(null);
  const nameOf = (item: LateArrivalSummary) =>
    names.get(item.student_user_id)?.name ?? tLate("unknownStudent");

  return (
    <Card>
      <CardHeader
        action={
          <TextLink href="/inbox?type=late" tone="muted">
            {t("openInbox")}
          </TextLink>
        }
      >
        <CardTitle as="h2" className="flex items-center gap-2">
          {t("title")}
          <CountBadge count={items.length} tone="accent" />
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      {queue.isLoading ? (
        <SkeletonList rows={3} leading />
      ) : queue.isError ? (
        <CardContent>
          <QueryError retry={() => void queue.refetch()} error={queue.error} />
        </CardContent>
      ) : items.length === 0 ? (
        <CardContent>
          <EmptyState
            variant="compact"
            icon={<domainIcons.late aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
          />
        </CardContent>
      ) : (
        <List>
          {items.map((item) => (
            <ListRow
              key={item.instance_id}
              leading={<Avatar size={40} name={nameOf(item)} decorative />}
              title={nameOf(item)}
              titleLines={2}
              meta={[
                t("occurrence", {
                  n: item.occurrence_number,
                  time: formatTime(item.opened_at, { locale, timeZone: me?.tenant.timezone }),
                }),
                item.reason,
              ]
                .filter(Boolean)
                .join(" · ")}
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setReviewing(item);
                  }}
                >
                  {tLate("review")}
                </Button>
              }
            />
          ))}
        </List>
      )}
      <Dialog
        open={reviewing !== null}
        onOpenChange={(open) => {
          if (!open) setReviewing(null);
        }}
      >
        <DialogContent
          title={tLate("reviewTitle")}
          description={reviewing ? nameOf(reviewing) : undefined}
        >
          {reviewing && (
            <LateArrivalReviewForm
              item={reviewing}
              onDone={() => {
                onReviewed(nameOf(reviewing));
                setReviewing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** What was recorded or reviewed at this desk since the page opened. */
function DeskLog({
  entries,
  locale,
  timeZone,
}: {
  entries: DeskLogEntry[];
  locale: Locale;
  timeZone: string | undefined;
}): ReactElement {
  const t = useTranslations("app.duty.log");
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      {entries.length === 0 ? (
        <CardContent>
          <p className="text-body-sm text-fg-muted">{t("empty")}</p>
        </CardContent>
      ) : (
        <List dense>
          {entries.map((entry) => (
            <ListRow
              key={entry.key}
              leading={<Avatar size={32} name={entry.studentName} decorative />}
              title={entry.studentName}
              titleLines={2}
              meta={t(`kinds.${entry.kind}`)}
              trailing={formatTime(entry.at, { locale, timeZone })}
            />
          ))}
        </List>
      )}
    </Card>
  );
}
