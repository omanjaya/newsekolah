"use client";

import { Badge, Stepper, cn, type StepperStepState } from "@newsekolah/ui";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { WorkflowInstance } from "../api";
import { buildMineStageTrack, type LeaveMineStageKey } from "../lib/leave-mine-stage-track";

const STATUS_VARIANT: Record<WorkflowInstance["status"], "neutral" | "accent"> = {
  in_progress: "accent",
  approved: "accent",
  completed: "accent",
  rejected: "neutral",
  cancelled: "neutral",
  expired: "neutral",
};

/** Stage progress plus a status badge; used by every workflow detail. */
export function WorkflowStepper({ instance }: { instance: WorkflowInstance }): ReactElement {
  const t = useTranslations("app.permits.workflow");
  const terminal =
    instance.status !== "in_progress" &&
    instance.status !== "approved" &&
    instance.status !== "completed";
  const currentIndex = Math.min(
    Math.max(instance.current_stage_index, 0),
    instance.stages.length - 1,
  );
  const steps = instance.stages.map((stage, index) => {
    let state: StepperStepState;
    if (instance.status === "approved" || instance.status === "completed") {
      state = "complete";
    } else if (index < currentIndex) {
      state = "complete";
    } else if (index === currentIndex) {
      state = terminal ? "stopped" : "current";
    } else {
      state = "upcoming";
    }
    return {
      id: stage.key,
      label: stage.label,
      description: t(`verification.${stage.verification}`),
      state,
    };
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge variant={STATUS_VARIANT[instance.status]}>{t(`status.${instance.status}`)}</Badge>
        {instance.current_stage && instance.status === "in_progress" && (
          <span className="text-[13px] text-fg-muted">
            {t("waitingFor", { stage: instance.current_stage.label })}
          </span>
        )}
      </div>
      <Stepper steps={steps} currentIndex={currentIndex} />
    </div>
  );
}

export function WorkflowStatusBadge({
  status,
}: {
  status: WorkflowInstance["status"];
}): ReactElement {
  const t = useTranslations("app.permits.workflow");
  return <Badge variant={STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>;
}

const MINI_CIRCLE_CLASS: Record<StepperStepState, string> = {
  complete: "border-accent bg-accent text-accent-fg",
  current: "border-accent text-accent",
  stopped: "border-status-absent text-status-absent",
  upcoming: "border-border text-fg-muted",
};

const STAGE_LABEL_KEY: Record<LeaveMineStageKey, "stageHomeroom" | "stageCounselor"> = {
  homeroom: "stageHomeroom",
  counselor: "stageCounselor",
};

/**
 * The compact horizontal stage track for a leave request card
 * (docs/07-ui-ux.md bento): "Diajukan" -> each default leave request stage
 * -> "Selesai", built from `buildMineStageTrack` since the "mine" list only
 * carries `status` + `current_stage_index`, not a full `WorkflowInstance`
 * with real per-tenant stage labels the way `WorkflowStepper` gets. Same
 * dot-and-connector language as `Stepper`, just small enough for a card.
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

  const labelFor = (node: ReturnType<typeof buildMineStageTrack>[number]): string => {
    if (node.kind === "submitted") return t("stageSubmitted");
    if (node.kind === "done") return t("stageDone");
    return t(STAGE_LABEL_KEY[node.stageKey ?? "homeroom"]);
  };

  return (
    <ol className={cn("flex items-start", className)} aria-label={t("stageTrackLabel")}>
      {nodes.map((node, index) => {
        const isLast = index === nodes.length - 1;
        return (
          <li
            key={node.id}
            data-testid={`mine-stage-track-node-${node.id}`}
            data-state={node.state}
            className={cn("flex flex-col items-center gap-1", isLast ? "shrink-0" : "flex-1")}
          >
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium",
                  MINI_CIRCLE_CLASS[node.state],
                )}
              >
                {node.state === "complete" ? (
                  <Check className="size-3" aria-hidden="true" />
                ) : node.state === "stopped" ? (
                  <X className="size-3" aria-hidden="true" />
                ) : null}
              </span>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mx-1 h-px flex-1",
                    node.state === "complete" ? "bg-accent" : "bg-border",
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                "text-center text-[10px] leading-tight",
                node.state === "upcoming" ? "text-fg-muted" : "text-fg",
              )}
            >
              {labelFor(node)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
