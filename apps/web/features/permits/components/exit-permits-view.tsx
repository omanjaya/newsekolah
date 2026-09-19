"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import {
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  domainIcons,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { type WorkflowInstance, useMyExitPermitsQuery } from "../api";

import { CreateForm, ExitPermitDetail } from "./exit-permit-detail";
import { ApprovePanel, GatePanel } from "./exit-permit-panels";
import { ExitPermitReviewQueue } from "./exit-permit-review-queue";
import { WorkflowStatusBadge } from "./workflow-stepper";

/**
 * Students: request, follow the stages, scan the approving teacher's QR,
 * then show the gate QR. Approvers and security: a shared queue of what is
 * waiting for them, then the existing approve/gate panels to act on it.
 */
export function ExitPermitsView(): ReactElement {
  const t = useTranslations("app.permits.exit");
  const canSubmit = useCan("submit_leave_requests");
  const canApprove = useCan("issue_scan_tokens");
  const canGate = useCan("scan_exit_permits");
  const [prefillId, setPrefillId] = useState<string | undefined>(undefined);

  const tabs = [
    ...(canApprove || canGate ? [{ value: "queue", label: t("tabQueue") }] : []),
    ...(canSubmit ? [{ value: "mine", label: t("tabMine") }] : []),
    ...(canApprove ? [{ value: "approve", label: t("tabApprove") }] : []),
    ...(canGate ? [{ value: "gate", label: t("tabGate") }] : []),
  ];
  const [tab, setTab] = useUrlState<string>(
    "tab",
    tabs.map((item) => item.value),
    tabs[0]?.value ?? "mine",
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      {tabs.length === 0 ? (
        <EmptyState
          icon={<domainIcons.exitPermit aria-hidden="true" />}
          title={t("noAccessTitle")}
          description={t("noAccessBody")}
        />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          {tabs.length > 1 && (
            <TabsList>
              {tabs.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          )}
          {(canApprove || canGate) && (
            <TabsContent value="queue" className="pt-4">
              <ExitPermitReviewQueue
                canApprove={canApprove}
                canGate={canGate}
                onProcess={(instanceId) => {
                  setPrefillId(instanceId);
                  setTab("approve");
                }}
              />
            </TabsContent>
          )}
          {canSubmit && (
            <TabsContent value="mine" className="pt-4">
              <MyExitPermits />
            </TabsContent>
          )}
          {canApprove && (
            <TabsContent value="approve" className="pt-4">
              <ApprovePanel key={prefillId ?? "manual"} prefillId={prefillId} />
            </TabsContent>
          )}
          {canGate && (
            <TabsContent value="gate" className="pt-4">
              <GatePanel />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

function MyExitPermits(): ReactElement {
  const t = useTranslations("app.permits.exit");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const { data, isLoading } = useMyExitPermitsQuery();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const items = data?.data ?? [];
  const active = items.find((i) => i.status === "in_progress" || i.status === "approved");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          icon={<Plus />}
          disabled={Boolean(active)}
          onClick={() => {
            setCreating(true);
          }}
        >
          {t("request")}
        </Button>
      </div>
      {active && <p className="text-[13px] text-fg-muted">{t("activeHint")}</p>}
      {isLoading ? (
        <Skeleton className="h-40 w-full" aria-busy="true" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<domainIcons.exitPermit aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((inst: WorkflowInstance) => (
            <li key={inst.id}>
              <button
                type="button"
                onClick={() => {
                  setOpenId(inst.id);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-sm border border-border bg-surface px-4 py-3 text-left hover:bg-bg"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] text-fg">
                    {formatDateTime(inst.opened_at, { locale, timeZone: me?.tenant.timezone })}
                  </span>
                  <span className="text-[13px] text-fg-muted">
                    {inst.current_stage
                      ? t("stageLabel", { stage: inst.current_stage.label })
                      : t("finished")}
                  </span>
                </div>
                <WorkflowStatusBadge status={inst.status} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title={t("request")}>
          {creating && (
            <CreateForm
              onDone={(id) => {
                setCreating(false);
                setOpenId(id);
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
        <DialogContent title={t("detailTitle")} className="max-w-xl">
          {openId && <ExitPermitDetail id={openId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
