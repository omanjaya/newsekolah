"use client";

import { Check, X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { useUiLabels } from "./ui-labels.js";

export interface StepperStep {
  id: string;
  label: string;
  description?: string;
  /** Who acted on (or is expected to act on) this step: "Bu Rina", "Menunggu wali kelas". */
  actor?: ReactNode;
  /** When it happened, already formatted in the school's time zone: "25 Sep 09.14". */
  time?: ReactNode;
  /**
   * What the person who acted wrote, such as a reviewer's reason for a
   * rejection: shown under the step, so the reader sees why. Left out by
   * the compact variant.
   */
  note?: ReactNode;
  state?: StepperStepState;
}

export type StepperStepState = "complete" | "current" | "stopped" | "upcoming";

export interface StepperProps {
  steps: StepperStep[];
  /** Index of the current step in `steps`. Steps before it render as complete. */
  currentIndex: number;
  /**
   * "horizontal" (default) lays the steps out in a row from 640px up and
   * as a vertical list on a phone, where a row has no room for labels,
   * actors and times. "vertical" is a list at every width.
   */
  orientation?: "horizontal" | "vertical";
  /**
   * "compact": small markers with the label only, always in a row: wizard
   * progress, or a status summary in a card. Descriptions, actors and
   * times are left out.
   */
  variant?: "default" | "compact";
  className?: string;
}

function stateOf(index: number, currentIndex: number): StepperStepState {
  if (index < currentIndex) return "complete";
  if (index === currentIndex) return "current";
  return "upcoming";
}

const MARKER_CLASS: Record<StepperStepState, string> = {
  complete: "bg-accent text-accent-fg",
  current:
    "bg-surface text-accent shadow-[inset_0_0_0_2px_var(--color-accent)] ring-4 ring-accent-soft",
  stopped: "bg-danger-soft text-danger",
  // An outlined disc on the raised surface: it stays visible on a white
  // card and on the dark page, where a sunken fill all but disappears.
  upcoming: "border border-border-strong/60 bg-surface-raised text-fg-muted",
};

/**
 * The line toward the next step: accent once this step is behind the
 * reader, otherwise a quiet stroke that still reads in the dark theme
 * (the `line` hairline is too faint there).
 */
function connectorClass(state: StepperStepState) {
  return state === "complete" ? "bg-accent" : "bg-border-strong/40";
}

function Marker({
  state,
  index,
  compact,
}: {
  state: StepperStepState;
  index: number;
  compact: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative z-[1] flex shrink-0 items-center justify-center rounded-full tabular-nums transition-colors",
        MARKER_CLASS[state],
        compact ? "size-5 text-caption [&>svg]:size-3" : "size-7 text-label [&>svg]:size-4",
        compact && state === "current" && "ring-2",
      )}
    >
      {state === "complete" ? (
        <Check strokeWidth={2.5} />
      ) : state === "stopped" ? (
        <X strokeWidth={2.5} />
      ) : (
        index + 1
      )}
    </span>
  );
}

/**
 * The stages of a workflow (izin keluar, terlambat) or a wizard (import,
 * new school year), per docs/07-ui-ux.md section 3: each step says what it
 * is, who acted and when. In a row, each label sits centred under its own
 * marker and the connectors run marker to marker; in a list, the
 * connector runs down beside the text. The current step carries
 * `aria-current="step"`; finished and stopped steps say so to screen
 * readers too, not only with an icon.
 */
export function Stepper({
  steps,
  currentIndex,
  orientation = "horizontal",
  variant = "default",
  className,
}: StepperProps) {
  const labels = useUiLabels();
  const compact = variant === "compact";
  // `row` means "a row from 640px up"; compact is a row at every width.
  const row = orientation === "horizontal" || compact;
  const rowAlways = compact;

  return (
    <ol
      className={cn(
        "flex",
        rowAlways ? "flex-row" : row ? "flex-col sm:flex-row" : "flex-col",
        className,
      )}
    >
      {steps.map((step, index) => {
        const state = step.state ?? stateOf(index, currentIndex);
        const previous = steps[index - 1];
        const previousState = previous
          ? (previous.state ?? stateOf(index - 1, currentIndex))
          : null;
        const first = index === 0;
        const last = index === steps.length - 1;
        const meta = [step.actor, step.time].filter(
          (part) => part !== undefined && part !== null && part !== "",
        );
        const stateText =
          state === "complete"
            ? labels.stepperStepComplete
            : state === "stopped"
              ? labels.stepperStepStopped
              : null;

        return (
          <li
            key={step.id}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "relative flex min-w-0",
              rowAlways
                ? "flex-1 flex-col items-center text-center"
                : row
                  ? "gap-3 pb-5 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-0 sm:pb-0 sm:text-center"
                  : "gap-3 pb-5 last:pb-0",
            )}
          >
            {/* Row connectors: halves on either side of the marker, so the
                line meets each marker and every label stays centred. */}
            {row && !first && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-0 h-0.5",
                  compact
                    ? "top-[9px] right-[calc(50%+14px)]"
                    : "top-[13px] right-[calc(50%+22px)]",
                  !rowAlways && "hidden sm:block",
                  connectorClass(previousState ?? "upcoming"),
                )}
              />
            )}
            {row && !last && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute right-0 h-0.5",
                  compact ? "top-[9px] left-[calc(50%+14px)]" : "top-[13px] left-[calc(50%+22px)]",
                  !rowAlways && "hidden sm:block",
                  connectorClass(state),
                )}
              />
            )}
            {/* List connector: from under this marker down to the next one. */}
            {!rowAlways && !last && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-8 bottom-1 left-[13px] w-0.5 rounded-full",
                  row && "sm:hidden",
                  connectorClass(state),
                )}
              />
            )}
            <Marker state={state} index={index} compact={compact} />
            <div
              className={cn(
                "flex min-w-0 flex-col",
                rowAlways
                  ? "mt-1.5 items-center px-1"
                  : row
                    ? "pt-1 sm:mt-2 sm:items-center sm:px-2 sm:pt-0"
                    : "pt-1",
              )}
            >
              <span
                className={cn(
                  compact ? "text-caption" : "text-label",
                  // An upcoming label is muted only while the stepper shows
                  // progress: a summary with no current step (currentIndex
                  // -1) would otherwise read as switched off.
                  state === "upcoming" && currentIndex >= 0 ? "text-fg-muted" : "text-fg",
                  state === "stopped" && "text-danger",
                )}
              >
                {step.label}
                {stateText && <span className="sr-only">, {stateText}</span>}
              </span>
              {!compact && step.description && (
                <span className="text-body-sm text-fg-muted">{step.description}</span>
              )}
              {!compact && meta.length > 0 && (
                <span className="mt-0.5 text-caption text-fg-muted">
                  {meta.map((part, partIndex) => (
                    <span key={partIndex}>
                      {/* The spaces stay outside the hidden dot, so a screen
                          reader still hears the actor and the time apart. */}
                      {partIndex > 0 && (
                        <>
                          {" "}
                          <span aria-hidden="true">·</span>{" "}
                        </>
                      )}
                      {part}
                    </span>
                  ))}
                </span>
              )}
              {!compact && step.note && (
                <span className="mt-1 rounded-md bg-surface-sunken px-2 py-1 text-left text-body-sm break-words whitespace-pre-line text-fg">
                  {step.note}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
