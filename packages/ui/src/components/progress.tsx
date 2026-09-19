import { cn } from "../utils/cn.js";

export interface ProgressProps {
  /** 0-100. Values outside that range are clamped. */
  value: number;
  label?: string;
  className?: string;
}

/**
 * A determinate progress bar for long-running client-side work with a
 * known percentage (file uploads, multi-step imports) -- not for
 * indeterminate loading, which uses Skeleton instead.
 */
export function Progress({ value, label, className }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <span className="text-[13px] text-fg-muted" aria-hidden="true">
          {label}
        </span>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-border/60"
      >
        <div
          className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-200 ease-out"
          style={{ transform: `scaleX(${clamped / 100})` }}
        />
      </div>
    </div>
  );
}
