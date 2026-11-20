"use client";

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
  SegmentedControl,
  SkeletonList,
  TextLink,
  domainIcons,
} from "@newsekolah/ui";
import { ChevronRight, ClipboardPen, MonitorPlay } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { useDirectoryNames } from "../../reference/directory-names";
import { type LateArrivalSummary, useLateArrivalQueueQuery } from "../api";

import { ApprovePanel } from "./approve-panel";
import { DeskLog, useDeskLog } from "./desk-log";
import { type DeskPurpose, DeskQrPanel } from "./desk-qr-panel";
import { type ManualRecord, DutyManualRecordPanel } from "./duty-manual-record-panel";
import { LateArrivalReviewForm } from "./late-arrivals-view";

/** The QR and approval modes of the desk; recording by hand is a task, not a mode. */
const MODES = ["classroom_entry", "late_arrival", "exit"] as const;
type DutyMode = (typeof MODES)[number];
/** `?mode=manual` (the old fourth mode) still opens the manual record. */
const URL_MODES = [...MODES, "manual"] as const;
type UrlMode = (typeof URL_MODES)[number];
/** Each mode's QR purpose: the exit mode is the picket stage's unbound approval. */
const MODE_PURPOSE: Record<DutyMode, DeskPurpose> = {
  classroom_entry: "classroom_entry",
  late_arrival: "late_arrival",
  exit: "approve_stage",
};

/**
 * Piket hari ini (docs/07-ui-ux.md section 4, "Guru piket"): one screen, no
 * menu diving. The QR for the chosen mode comes first and large, with its
 * countdown; the late arrivals waiting for review and what was recorded at
 * this desk today sit beside it on a laptop and under it on a phone. Each QR
 * is a single-use token that renews itself when it expires; the exit mode's
 * approves the picket stage of whichever student's permit scans it, so the
 * teacher never types a permit code. Recording a
 * student without a phone is the page's primary action, a dialog (a bottom
 * sheet on a phone), so the three modes fit one row at 390px.
 */
export function DutyView(): ReactElement {
  const t = useTranslations("app.duty");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const canMonitor = useCan("view_monitor_presence");
  const [urlMode, setMode] = useUrlState<UrlMode>("mode", URL_MODES, "classroom_entry");
  // The exit mode's QR approves an any_teacher stage, so the server mints it
  // only for an active teacher; anyone else at the desk is not offered it.
  const modes = me?.profile_kind === "teacher" ? MODES : MODES.filter((m) => m !== "exit");
  const mode: DutyMode =
    urlMode === "manual" || !modes.some((m) => m === urlMode) ? "classroom_entry" : urlMode;
  const [manualRequested, setManualRequested] = useState(false);
  const manualOpen = manualRequested || urlMode === "manual";
  const { entries: log, remember } = useDeskLog();
  const today = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: me?.tenant.timezone,
  }).format(businessNow());

  function closeManual() {
    setManualRequested(false);
    if (urlMode === "manual") setMode("classroom_entry");
  }

  return (
    // The eyebrow is the sidebar group ("Piket dan gerbang"), not a repeat
    // of the title.
    <AppPage
      variant="wide"
      title={t("title")}
      description={today}
      nav={false}
      primaryAction={
        <Button
          icon={<ClipboardPen />}
          onClick={() => {
            setManualRequested(true);
          }}
        >
          {t("purposes.manual")}
        </Button>
      }
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
          options={modes.map((value) => ({ value, label: t(`purposes.${value}`) }))}
          value={mode}
          onValueChange={setMode}
          fullWidth="phone"
        />
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <DeskQrPanel
            key={mode}
            purpose={MODE_PURPOSE[mode]}
            label={t(`qrLabel.${mode}`)}
            help={t(`help.${mode}`)}
            onApproved={(approval) => {
              remember({
                key: `exitApproved:${approval.instanceId}`,
                kind: "exitApproved",
                studentUserId: approval.studentUserId,
              });
            }}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <LateQueue
            onReviewed={(name) => {
              remember({ kind: "review", studentName: name });
            }}
          />
          <DeskLog entries={log} />
        </div>
      </div>

      <Dialog
        open={manualOpen}
        onOpenChange={(open) => {
          if (!open) closeManual();
        }}
      >
        <DialogContent title={t("manualForm.title")} description={t("manualForm.intro")}>
          <DutyManualRecordPanel
            layout="dialog"
            onRecorded={(record: ManualRecord) => {
              remember({ kind: record.kind, studentName: record.studentName });
              closeManual();
            }}
          />
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}

/**
 * Late arrivals waiting on this teacher, with one tap each: the review form
 * while a flow waits at the picket review, or the stage QR when it waits
 * for this teacher's approval scan (a picket teacher who also holds the
 * leadership duty, say).
 */
function LateQueue({ onReviewed }: { onReviewed: (studentName: string) => void }): ReactElement {
  const t = useTranslations("app.duty.queue");
  const tLate = useTranslations("app.permits.late");
  const tApprove = useTranslations("app.permits.approve");
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
  const showsQr = reviewing?.current_stage.verification === "qr_scan";
  const nameOf = (item: LateArrivalSummary) =>
    names.get(item.student_user_id)?.name ?? tLate("unknownStudent");
  const close = () => {
    setReviewing(null);
  };

  return (
    <Card>
      <CardHeader
        action={
          <TextLink href="/inbox?type=late" className="inline-flex items-center gap-0.5">
            {t("openInbox")}
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
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
                // A picket teacher works across the whole school, where a
                // name alone can be two students.
                item.class_name,
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
                  {item.current_stage.verification === "qr_scan"
                    ? tLate("showQr")
                    : tLate("review")}
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
          title={
            reviewing && showsQr
              ? tApprove("titleStage", { stage: reviewing.current_stage.label })
              : tLate("reviewTitle")
          }
          description={
            reviewing
              ? [nameOf(reviewing), reviewing.class_name].filter(Boolean).join(" · ")
              : undefined
          }
        >
          {reviewing &&
            (showsQr ? (
              <ApprovePanel
                key={reviewing.instance_id}
                kind="late_arrival"
                instanceId={reviewing.instance_id}
                onApproved={close}
              />
            ) : (
              <LateArrivalReviewForm
                item={reviewing}
                onDone={() => {
                  onReviewed(nameOf(reviewing));
                  close();
                }}
              />
            ))}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
