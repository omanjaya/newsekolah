"use client";

import { cn } from "@newsekolah/ui";
import type { KeyboardEvent, ReactElement } from "react";
import { useRef } from "react";

/**
 * One criterion's score, as a row of large tap targets rather than a number
 * spinner -- the instrument is filled live during a lesson, often on a
 * tablet, where a stepper is fiddly and easy to mis-tap. Generated from the
 * instrument's own `scale_min..scale_max` (an arbitrary integer range per
 * instrument), unlike `AttendanceStatusRadioGroup`, which is fixed to five
 * named statuses -- this only has numbers, so it is its own small
 * component rather than a copy of that one.
 */
export function ObservationScoreControl({
  min,
  max,
  value,
  label,
  disabled,
  onChange,
}: {
  min: number;
  max: number;
  value: number | null;
  label: string;
  disabled: boolean;
  onChange: (score: number) => void;
}): ReactElement {
  const controls = useRef(new Map<number, HTMLButtonElement>());
  const scores = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);

  function selectAt(index: number) {
    const next = scores[index];
    if (next === undefined) return;
    onChange(next);
    controls.current.get(next)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectAt((index + 1) % scores.length);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectAt((index - 1 + scores.length) % scores.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectAt(scores.length - 1);
    }
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {scores.map((score, index) => {
        const selected = value === score;
        return (
          <button
            key={score}
            ref={(element) => {
              if (element) controls.current.set(score, element);
              else controls.current.delete(score);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (index === 0 && value === null) ? 0 : -1}
            disabled={disabled}
            onClick={() => {
              onChange(score);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
            className={cn(
              "flex min-h-11 min-w-11 items-center justify-center rounded-xs border text-[14px] font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              selected ? "border-accent bg-accent text-bg" : "border-border text-fg hover:bg-bg",
            )}
          >
            {score}
          </button>
        );
      })}
    </div>
  );
}
