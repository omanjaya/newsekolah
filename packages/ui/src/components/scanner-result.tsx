import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { cn } from "../utils/cn.js";

export type ScannerResultTone = "success" | "danger" | "warning" | "info";

/** The outcome of the last scan, as the page wants it said. */
export interface ScannerResultValue {
  tone: ScannerResultTone;
  title: ReactNode;
  description?: ReactNode;
  /**
   * Changes on every scan (a counter, a timestamp), so the same message
   * twice in a row is still announced and re-shown.
   */
  key?: string | number;
}

const ICONS: Record<ScannerResultTone, ReactNode> = {
  success: <CircleCheck />,
  danger: <CircleAlert />,
  warning: <TriangleAlert />,
  info: <Info />,
};

/*
 * Action: soft tone fill with the tone's own ink, like an inline alert.
 * Kiosk: the solid tone for the two outcomes read from across a room (in
 * or not), soft for the in-between ones; every pair is in the token
 * contrast check (accent-fg on accent, bg on danger, the soft pairs).
 */
const TONE: Record<"action" | "kiosk", Record<ScannerResultTone, string>> = {
  action: {
    success: "bg-success-soft text-success-soft-fg",
    danger: "bg-danger-soft text-danger-soft-fg",
    warning: "bg-warning-soft text-warning-soft-fg",
    info: "bg-info-soft text-info-soft-fg",
  },
  kiosk: {
    success: "bg-accent text-accent-fg",
    danger: "bg-danger text-bg",
    warning: "bg-warning-soft text-warning-soft-fg",
    info: "bg-info-soft text-info-soft-fg",
  },
};

const ICON_TONE: Record<ScannerResultTone, string> = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  info: "text-info",
};

/**
 * The last-result banner under a scanner's viewfinder. It enters with the
 * standard 200ms rise each time a new result arrives; the live region
 * around it (in `Scanner`) announces it.
 */
export function ScannerResultBanner({
  result,
  variant = "action",
}: {
  result: ScannerResultValue;
  variant?: "action" | "kiosk";
}): ReactElement {
  const kiosk = variant === "kiosk";
  const solid = kiosk && (result.tone === "success" || result.tone === "danger");
  return (
    <div
      data-slot="scanner-result"
      data-tone={result.tone}
      className={cn(
        "flex animate-enter items-start rounded-lg",
        kiosk ? "gap-4 p-5 md:p-6" : "gap-3 p-4",
        TONE[variant][result.tone],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full",
          kiosk ? "size-12 [&>svg]:size-7" : "size-9 [&>svg]:size-5",
          // On a solid fill the disc is a faint tint of the page and the icon takes the fill's ink.
          solid ? "bg-surface/20 text-current" : cn("bg-surface", ICON_TONE[result.tone]),
        )}
      >
        {ICONS[result.tone]}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 pt-px">
        <p className={kiosk ? "text-display" : "text-heading"}>{result.title}</p>
        {result.description !== undefined && (
          <div className={kiosk ? "text-heading font-sans font-normal" : "text-body-sm"}>
            {result.description}
          </div>
        )}
      </div>
    </div>
  );
}
