"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

export type ProgressTone = "accent" | "success" | "warning" | "danger" | "info";

export interface ProgressProps {
  /** Progress so far, from 0 to `max`. Values outside that range are clamped. */
  value: number;
  /** The value that fills the bar. Default 100, so `value` reads as a percentage. */
  max?: number;
  label?: string;
  /**
   * "bar" (default): a thin bar for work in progress (an upload, an
   * import). "meter": a measured amount against a target ("Kehadiran
   * 96%", a score against the passing grade), with the label and the
   * value above a thicker track, announced as a meter.
   */
  variant?: "bar" | "meter";
  tone?: ProgressTone;
  /** The meter's value text; defaults to the rounded percentage ("96%"). */
  valueLabel?: ReactNode;
  /** The accessible name when no visible `label` is shown. */
  "aria-label"?: string;
  className?: string;
}

const FILL_TONE: Record<ProgressTone, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

/** The next animation frame, or the next task where there are no frames (tests). */
function nextFrame(callback: () => void): { cancel: () => void } {
  if (typeof requestAnimationFrame === "function") {
    const id = requestAnimationFrame(callback);
    return {
      cancel: () => {
        cancelAnimationFrame(id);
      },
    };
  }
  const id = setTimeout(callback, 0);
  return {
    cancel: () => {
      clearTimeout(id);
    },
  };
}

/**
 * A determinate bar or meter -- not for indeterminate loading, which uses
 * Skeleton instead. The fill grows with `motion-meter` (320ms, transform
 * only): from empty when it first appears, then from value to value. It
 * jumps under reduced motion.
 */
export function Progress({
  value,
  max = 100,
  label,
  variant = "bar",
  tone = "accent",
  valueLabel,
  "aria-label": ariaLabel,
  className,
}: ProgressProps) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.min(safeMax, Math.max(0, value));
  const fraction = clamped / safeMax;
  const percent = Math.round(fraction * 100);
  // Start empty and fill on the first frame, so the bar grows in once.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = nextFrame(() => {
      setShown(fraction);
    });
    return frame.cancel;
  }, [fraction]);

  const meter = variant === "meter";
  const fillStyle = { "--progress": String(shown) } as CSSProperties;

  return (
    <div className={cn("flex flex-col", meter ? "gap-2" : "gap-1.5", className)}>
      {(Boolean(label) || meter) && (
        <div className="flex items-baseline justify-between gap-3" aria-hidden="true">
          {label && (
            <span className={cn(meter ? "text-label text-fg" : "text-body-sm text-fg-muted")}>
              {label}
            </span>
          )}
          {meter && (
            <span className="ml-auto text-label text-fg tabular-nums">
              {valueLabel ?? `${percent}%`}
            </span>
          )}
        </div>
      )}
      <div
        role={meter ? "meter" : "progressbar"}
        aria-valuenow={Math.round(clamped * 100) / 100}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuetext={typeof valueLabel === "string" ? valueLabel : `${percent}%`}
        aria-label={ariaLabel ?? label}
        className={cn(
          "w-full overflow-hidden rounded-full bg-surface-sunken",
          meter ? "h-2.5" : "h-1.5",
        )}
      >
        <div
          style={fillStyle}
          className={cn(
            "h-full w-full origin-left scale-x-(--progress) rounded-full motion-meter",
            FILL_TONE[tone],
          )}
        />
      </div>
    </div>
  );
}
