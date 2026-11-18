"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

export type ProgressTone = "accent" | "success" | "warning" | "danger" | "info";

/** A threshold drawn on the track: a passing grade, a warning-letter level. */
export interface ProgressMarker {
  /** Where the line sits, on the same scale as `value` (0 to `max`). */
  value: number;
  /** A short name under the line ("SP 1", "KKTP"); without it the line stands alone. */
  label?: string;
}

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
  /**
   * Thresholds on the scale, each a thin line across the track with an
   * optional short name under it. They are drawn, not announced: say the
   * thresholds in text as well (the label, a legend), as the meter's own
   * value text does not include them.
   */
  markers?: ProgressMarker[];
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

/** Where a marker's name sits against its line: from the line near the start, up to it near the end. */
function markerLabelAlign(fraction: number): string {
  if (fraction <= 0.1) return "";
  if (fraction >= 0.9) return "-translate-x-full";
  return "-translate-x-1/2";
}

function markerStyle(fraction: number): CSSProperties {
  return { "--marker": String(fraction) } as CSSProperties;
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
  markers = [],
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
  const fractions = markers.map((marker, index) => ({
    key: `${String(index)}-${String(marker.value)}`,
    fraction: Math.min(safeMax, Math.max(0, marker.value)) / safeMax,
    label: marker.label,
  }));
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
      <div className="relative">
        <div
          role={meter ? "meter" : "progressbar"}
          aria-valuenow={Math.round(clamped * 100) / 100}
          aria-valuemin={0}
          aria-valuemax={safeMax}
          aria-valuetext={typeof valueLabel === "string" ? valueLabel : `${percent}%`}
          aria-label={ariaLabel ?? label}
          // The track is a 9% wash of the text colour, not a surface: it
          // stays one step from whatever it sits on (a card, the mint hero,
          // a raised menu) in both themes.
          className={cn(
            "w-full overflow-hidden rounded-full bg-neutral-soft",
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
        {/* Outside the clipped track, so each line reaches 4px past it on
            both sides and reads against the fill and the empty track alike. */}
        {fractions.map(({ key, fraction }) => (
          <span
            key={key}
            aria-hidden="true"
            data-slot="progress-marker"
            style={markerStyle(fraction)}
            className={cn(
              "pointer-events-none absolute -inset-y-1 left-[calc(var(--marker)*100%)] w-0.5 rounded-full bg-fg",
              fraction <= 0 ? "" : fraction >= 1 ? "-translate-x-full" : "-translate-x-1/2",
            )}
          />
        ))}
      </div>
      {fractions.some(({ label: name }) => Boolean(name)) && (
        <div aria-hidden="true" className="relative h-4">
          {fractions.map(({ key, fraction, label: name }) =>
            name ? (
              <span
                key={key}
                style={markerStyle(fraction)}
                className={cn(
                  "absolute top-0 left-[calc(var(--marker)*100%)] text-caption whitespace-nowrap text-fg-muted",
                  markerLabelAlign(fraction),
                )}
              >
                {name}
              </span>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
