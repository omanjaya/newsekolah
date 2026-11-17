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
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { type WorkflowInstance, useMyExitPermitsQuery } from "../api";
import { formatShortDate } from "../lib/permit-dates";
import { useCanSubmitPermit } from "../lib/use-can-submit-permit";

import { ActiveExitPermitCard, CreateForm, ExitPermitDetail } from "./exit-permit-detail";
import { ApprovePanel, GatePanel } from "./exit-permit-panels";
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
  const canApprove = useCan("issue_scan_tokens");
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

  return (
    <AppPage
      toolbar={
        modes.length > 1 ? (
          <SegmentedControl
            aria-label={t("modeLabel")}
            options={modes}
            value={mode}
            onValueChange={setMode}
            className="self-start"
          />
        ) : undefined
      }
    >
      <ReviewInboxBanner />
      {mode === "gate" && canGate ? <GatePanel /> : canApprove ? <ApprovePanel /> : <GatePanel />}
    </AppPage>
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
  const history = items.filter((item) => item !== active);
  const timeZone = me?.tenant.timezone;

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
          {active ? (
            <ActiveExitPermitCard id={active.id} />
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
                    title={formatShortDate(inst.opened_at, locale, timeZone)}
                    meta={t("openedAt", {
                      time: formatTime(inst.opened_at, { locale, timeZone }),
                    })}
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
