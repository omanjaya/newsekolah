"use client";

import { CircleCheck, Info, OctagonAlert, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { TONE_CLASSES, type SemanticTone } from "./tone.js";
import { useUiLabels } from "./ui-labels.js";

export type AlertVariant = SemanticTone;

const ICON: Record<AlertVariant, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: OctagonAlert,
};

const ICON_COLOR: Record<AlertVariant, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export interface AlertProps extends Omit<ComponentPropsWithoutRef<"div">, "title"> {
  /** `info` (default), `success`, `warning`, or `danger` for a failure (announced at once). */
  variant?: AlertVariant | null;
  title?: ReactNode;
  /** Replaces the variant's icon. */
  icon?: ReactNode;
  /** One button or link, on the right on a wide screen and under the text on a phone. */
  action?: ReactNode;
  /** Shows a close button. */
  onDismiss?: () => void;
  dismissLabel?: string;
}

/**
 * A message that stays on the page (no active academic year, a failed
 * load, a verified document), as opposed to a toast. Soft tint of its
 * semantic tone, icon, title, description (children) and an action slot.
 */
export function Alert({
  className,
  variant,
  title,
  icon,
  action,
  onDismiss,
  dismissLabel,
  children,
  ...props
}: AlertProps) {
  const labels = useUiLabels();
  const tone: AlertVariant = variant ?? "info";
  const Icon = ICON[tone];
  const colors = TONE_CLASSES[tone];
  const hasDescription = children !== undefined && children !== null && children !== false;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-md px-4 py-3", colors.soft, className)}
      {...props}
    >
      {/* A one-line alert centres its title on the action button from
          640px up, so the icon follows the title there. */}
      <span
        className={cn(
          "shrink-0 [&>svg]:size-5",
          ICON_COLOR[tone],
          !hasDescription && action && "sm:self-center",
        )}
        aria-hidden="true"
      >
        {icon ?? <Icon />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {title !== undefined && <p className="text-body font-semibold">{title}</p>}
          {hasDescription && (
            <div className={cn("flex flex-col items-start gap-2 text-body-sm", colors.softMuted)}>
              {children}
            </div>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel ?? labels.alertDismiss}
          className="-my-1.5 -mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-state-hover active:bg-state-pressed pointer-coarse:size-11 pointer-coarse:-my-3 pointer-coarse:-mr-3.5"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
