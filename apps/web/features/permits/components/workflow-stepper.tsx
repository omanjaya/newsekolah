"use client";

import type { Locale } from "@newsekolah/i18n";
import {
  SemanticStatusBadge,
  Stepper,
  type StepperProps,
  type StepperStep,
  type StepperStepState,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import type { WorkflowInstance } from "../api";
import { buildMineStageTrack, type LeaveMineStageKey } from "../lib/leave-mine-stage-track";
import { formatShortDateTime } from "../lib/permit-dates";

/** Where a stage of `instance` stands, from the instance's status and current index. */
function stageState(instance: WorkflowInstance, index: number): StepperStepState {
  const currentIndex = Math.min(
    Math.max(instance.current_stage_index, 0),
    instance.stages.length - 1,
  );
  if (instance.status === "approved" || instance.status === "completed") return "complete";
  if (index < currentIndex) return "complete";
  if (index === currentIndex) return instance.status === "in_progress" ? "current" : "stopped";
  return "upcoming";
}

/** When each stage was last acted on, from the instance's event log (newest wins). */
function stageTimes(instance: WorkflowInstance): Map<string, string> {
  const times = new Map<string, string>();
  for (const event of instance.events ?? []) {
    if (!event.stage_key) continue;
    const previous = times.get(event.stage_key);
    if (!previous || previous < event.occurred_at) times.set(event.stage_key, event.occurred_at);
  }
  return times;
}

/**
 * The stages of one request as the shared `Stepper` (docs/07-ui-ux.md
 * section 3, Workflow): each stage with how it is verified and, once
 * acted on, when. A row from 640px up and a list on a phone, where the
 * row has no room for the times.
 */
export function WorkflowSteps({
  instance,
  orientation,
  className,
}: {
  instance: WorkflowInstance;
  orientation?: StepperProps["orientation"];
  className?: string;
}): ReactElement {
  const t = useTranslations("app.permits.workflow");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const times = stageTimes(instance);
  const steps: StepperStep[] = instance.stages.map((stage, index) => {
    const state = stageState(instance, index);
    const at = times.get(stage.key);
    return {
      id: stage.key,
      label: stage.label,
      description: t(`verification.${stage.verification}`),
      time:
        at && (state === "complete" || state === "stopped")
          ? formatShortDateTime(at, locale, me?.tenant.timezone)
          : undefined,
      state,
    };
  });
  return (
    <Stepper
      steps={steps}
      currentIndex={instance.current_stage_index}
      orientation={orientation}
      className={className}
    />
  );
}

/** Stage progress plus a status line; the detail dialogs and review forms use it. */
export function WorkflowStepper({ instance }: { instance: WorkflowInstance }): ReactElement {
  const t = useTranslations("app.permits.workflow");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SemanticStatusBadge status={instance.status} label={t(`status.${instance.status}`)} />
        {instance.current_stage && instance.status === "in_progress" && (
          <span className="text-body-sm text-fg-muted">
            {t("waitingFor", { stage: instance.current_stage.label })}
          </span>
        )}
      </div>
      <WorkflowSteps instance={instance} />
    </div>
  );
}

export function WorkflowStatusBadge({
  status,
}: {
  status: WorkflowInstance["status"];
}): ReactElement {
  const t = useTranslations("app.permits.workflow");
  return <SemanticStatusBadge status={status} label={t(`status.${status}`)} />;
}

const STAGE_LABEL_KEY: Record<LeaveMineStageKey, "stageHomeroom" | "stageCounselor"> = {
  homeroom: "stageHomeroom",
  counselor: "stageCounselor",
};

/**
 * The compact stage track for a leave request row: "Diajukan", each
 * default leave stage, then "Selesai", built from `buildMineStageTrack`
 * since the "mine" list only carries `status` and `current_stage_index`,
 * not the tenant's stage labels. The shared compact `Stepper`, so the
 * row speaks the same visual language as the full detail.
 */
export function WorkflowMineStageTrack({
  status,
  currentStageIndex,
  className,
}: {
  status: WorkflowInstance["status"];
  currentStageIndex: number;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.permits.leave.mine");
  const nodes = buildMineStageTrack(status, currentStageIndex);
  const steps: StepperStep[] = nodes.map((node) => ({
    id: node.id,
    label:
      node.kind === "submitted"
        ? t("stageSubmitted")
        : node.kind === "done"
          ? t("stageDone")
          : t(STAGE_LABEL_KEY[node.stageKey ?? "homeroom"]),
    state: node.state,
  }));
  const current = nodes.findIndex((node) => node.state === "current");
  return (
    <div aria-label={t("stageTrackLabel")} role="group" className={className}>
      <Stepper variant="compact" steps={steps} currentIndex={current === -1 ? 0 : current} />
    </div>
  );
}
