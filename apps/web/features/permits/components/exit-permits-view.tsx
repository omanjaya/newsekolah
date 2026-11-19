"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import {
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  IconCircle,
  List,
  ListRow,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  SkeletonList,
  domainIcons,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { type WorkflowInstance, useMyExitPermitsQuery } from "../api";
import { formatShortWeekdayDate } from "../lib/permit-dates";
import { useCanSubmitPermit } from "../lib/use-can-submit-permit";

import { DeskLog, useDeskLog } from "./desk-log";
import { DeskQrPanel } from "./desk-qr-panel";
import { ActiveExitPermitCard, CreateForm, ExitPermitDetail } from "./exit-permit-detail";
import { GatePanel } from "./exit-permit-panels";
import { ReviewInboxBanner } from "./review-inbox-banner";
import { WorkflowStatusBadge } from "./workflow-stepper";

/** A permit still on its way, or approved and not yet through the gate. */
function isActive(inst: WorkflowInstance): boolean {
  return inst.status === "in_progress" || inst.status === "approved";
}

/**
 * Izin keluar. Students request, follow the stages, scan each approving
 * teacher's QR, then show the gate QR. Approving teachers and security get
 * their own scan screen: the shared review queue lives in the Perlu
 * tindakan inbox. The h1 is the area's label and the eyebrow its sidebar
 * group, from the template, the same on every tab of the area.
 */
export function ExitPermitsView(): ReactElement {
  const canSubmit = useCanSubmitPermit();
  const { me } = useSession();
  // issue_scan_tokens alone is not enough: staff (TU, satpam) hold it for
  // other QRs, but the desk approval QR approves an any_teacher stage and
  // the server mints it only for an active teacher.
  const canApprove = useCan("issue_scan_tokens") && me?.profile_kind === "teacher";
  const canGate = useCan("scan_exit_permits");
  if (canSubmit) return <MyExitPermits />;
  if (canApprove || canGate) return <ExitPermitDesk canApprove={canApprove} canGate={canGate} />;
  return <NoExitAccess />;
}

function NoExitAccess(): ReactElement {
  const t = useTranslations("app.permits.exit");
  return (
    <AppPage>
      <EmptyState
        icon={<domainIcons.exitPermit aria-hidden="true" />}
        title={t("noAccessTitle")}
        description={t("noAccessBody")}
      />
    </AppPage>
  );
}

/** Teachers approve a stage by showing a QR; security scans the gate QR. */
function ExitPermitDesk({
  canApprove,
  canGate,
}: {
  canApprove: boolean;
  canGate: boolean;
}): ReactElement {
  const t = useTranslations("app.permits.exit");
  // Whoever holds the gate duty works the gate first; approving a stage
  // is the teachers' everyday task.
  const modes = [
    ...(canGate ? [{ value: "gate", label: t("tabGate") }] : []),
    ...(canApprove ? [{ value: "approve", label: t("tabApprove") }] : []),
  ];
  const [mode, setMode] = useUrlState<string>(
    "tab",
    modes.map((item) => item.value),
    modes[0]?.value ?? "approve",
  );

  // One row of navigation: the switch sits in the scanner's own header
  // instead of a second strip under the area's tabs.
  const modeSwitch =
    modes.length > 1 ? (
      <SegmentedControl
        aria-label={t("modeLabel")}
        options={modes}
        value={mode}
        onValueChange={setMode}
        size="sm"
      />
    ) : undefined;

  return (
    <AppPage>
      <ReviewInboxBanner />
      {mode === "gate" && canGate ? (
        <GatePanel modeSwitch={modeSwitch} />
      ) : canApprove ? (
        <ApproveDesk modeSwitch={modeSwitch} />
      ) : (
        <GatePanel modeSwitch={modeSwitch} />
      )}
    </AppPage>
  );
}

/**
 * The picket stage's approval, the same rotating QR as the duty desk's
 * izin keluar mode: the student scans it from their permit, so nobody
 * types a permit code. Later stages (BK, pimpinan) are approved from the
 * Perlu tindakan inbox, which opens each permit's own stage QR.
 */
function ApproveDesk({ modeSwitch }: { modeSwitch?: ReactNode }): ReactElement {
  const t = useTranslations("app.permits.exit.approve");
  const { entries, remember } = useDeskLog();
  return (
    <section className="flex w-full max-w-xl flex-col gap-4" aria-labelledby="exit-approve-title">
      <SectionHeader
        titleId="exit-approve-title"
        title={t("title")}
        description={t("hint")}
        action={modeSwitch}
      />
      <DeskQrPanel
        purpose="approve_stage"
        label={t("qrLabel")}
        help={t("help")}
        onApproved={(approval) => {
          remember({
            key: `exitApproved:${approval.instanceId}`,
            kind: "exitApproved",
            studentUserId: approval.studentUserId,
          });
        }}
      />
      <DeskLog entries={entries} />
    </section>
  );
}

function MyExitPermits(): ReactElement {
  const t = useTranslations("app.permits.exit");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const { data, isLoading, isError, refetch } = useMyExitPermitsQuery();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const items = data?.data ?? [];
  const active = items.find(isActive);
  // The permit the status card showed last. The gate scan completes it,
  // so it is no longer active; the card stays on it so that its exited
  // state ("Sudah keluar", with the time) answers the scan, instead of the
  // page dropping back to the idle prompt under the student's eyes. A
  // cancelled permit still leaves the card, and a fresh visit starts idle.
  const [cardId, setCardId] = useState<string | null>(null);
  if (active && active.id !== cardId) setCardId(active.id);
  const exited = active
    ? undefined
    : items.find((item) => item.id === cardId && item.status === "completed");
  const onCard = active ?? exited;
  const history = items.filter((item) => item !== onCard);
  const timeZone = me?.tenant.timezone;
  // The school's today, so a row in its current year drops the year.
  const today = todayInZone(timeZone);

  return (
    // No header action: the idle card carries "Ajukan izin keluar", and
    // while a permit is on its way there is nothing new to request.
    <AppPage>
      {isLoading ? (
        <>
          <Skeleton className="h-56 w-full rounded-xl" />
          <SkeletonList rows={3} leading framed />
        </>
      ) : isError && !data ? (
        <QueryError retry={() => refetch()} />
      ) : (
        <>
          {onCard ? (
            <ActiveExitPermitCard id={onCard.id} />
          ) : (
            <EmptyState
              icon={<domainIcons.exitPermit aria-hidden="true" />}
              title={t("idleTitle")}
              description={t("idleBody")}
              action={
                <Button
                  size="lg"
                  icon={<Plus />}
                  onClick={() => {
                    setCreating(true);
                  }}
                >
                  {t("request")}
                </Button>
              }
            />
          )}
          {history.length > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="exit-history-title">
              <SectionHeader
                titleId="exit-history-title"
                title={t("historyTitle")}
                count={history.length}
              />
              <List framed>
                {history.map((inst) => (
                  <ListRow
                    key={inst.id}
                    leading={
                      <IconCircle tone="neutral">
                        <domainIcons.exitPermit />
                      </IconCircle>
                    }
                    // Where the student went names the row; the day and the
                    // gate time (or, before the gate, the request time) say when;
                    // each wraps whole on a phone, never "keluar" / "15.49".
                    title={inst.destination}
                    meta={[
                      formatShortWeekdayDate(inst.opened_at, locale, timeZone, today),
                      inst.exited_at
                        ? t("exitedMeta", {
                            time: formatTime(inst.exited_at, { locale, timeZone }),
                          })
                        : t("openedAt", {
                            time: formatTime(inst.opened_at, { locale, timeZone }),
                          }),
                    ]}
                    // The date stays whole on a 320px phone in every locale
                    // ("19 Nov 2025" beside "Completed"): the badge gives way.
                    keepMetaWhole
                    trailing={<WorkflowStatusBadge status={inst.status} />}
                    onClick={() => {
                      setOpenId(inst.id);
                    }}
                  />
                ))}
              </List>
            </section>
          )}
        </>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("request")} description={t("form.description")}>
          {creating && (
            <CreateForm
              onCancel={() => {
                setCreating(false);
              }}
              onDone={() => {
                setCreating(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DialogContent title={t("detailTitle")} size="lg">
          {openId && <ExitPermitDetail id={openId} />}
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}
