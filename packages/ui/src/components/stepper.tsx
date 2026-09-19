import { Check, X } from "lucide-react";

import { cn } from "../utils/cn.js";

export interface StepperStep {
  id: string;
  label: string;
  description?: string;
  state?: StepperStepState;
}

export type StepperStepState = "complete" | "current" | "stopped" | "upcoming";

export interface StepperProps {
  steps: StepperStep[];
  /** Index of the current step in `steps`. Steps before it render as complete. */
  currentIndex: number;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

function stateOf(index: number, currentIndex: number): StepperStepState {
  if (index < currentIndex) return "complete";
  if (index === currentIndex) return "current";
  return "upcoming";
}

const CIRCLE_CLASS: Record<StepperStepState, string> = {
  complete: "border-accent bg-accent text-accent-fg",
  current: "border-accent text-accent",
  stopped: "border-status-absent text-status-absent",
  upcoming: "border-border text-fg-muted",
};

/** Used by every multi-stage workflow (izin keluar, terlambat), per docs/05-shared-components.md. */
export function Stepper({
  steps,
  currentIndex,
  orientation = "horizontal",
  className,
}: StepperProps) {
  return (
    <ol
      className={cn(
        "flex",
        orientation === "horizontal" ? "flex-row items-start gap-2" : "flex-col gap-4",
        className,
      )}
    >
      {steps.map((step, index) => {
        const state = step.state ?? stateOf(index, currentIndex);
        const isLast = index === steps.length - 1;
        return (
          <li
            key={step.id}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "flex gap-3",
              orientation === "horizontal"
                ? "flex-1 flex-col items-center text-center"
                : "flex-row",
            )}
          >
            <div
              className={cn(
                "flex items-center",
                orientation === "horizontal" ? "w-full" : "flex-col",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-sm border text-[12px] font-medium",
                  CIRCLE_CLASS[state],
                )}
              >
                {state === "complete" ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : state === "stopped" ? (
                  <X className="size-3.5" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    orientation === "horizontal" ? "mx-2 h-px flex-1" : "my-1 h-6 w-px",
                    state === "complete" ? "bg-accent" : "bg-border",
                  )}
                />
              )}
            </div>
            <div className={cn("flex flex-col", orientation === "horizontal" && "items-center")}>
              <span
                className={cn(
                  "text-[13px] font-medium",
                  state === "upcoming" ? "text-fg-muted" : "text-fg",
                )}
              >
                {step.label}
              </span>
              {step.description && (
                <span className="text-[12px] text-fg-muted">{step.description}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
