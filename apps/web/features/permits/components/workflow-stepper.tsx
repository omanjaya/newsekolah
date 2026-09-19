"use client";

import { Badge, Stepper, type StepperStepState } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { WorkflowInstance } from "../api";

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
