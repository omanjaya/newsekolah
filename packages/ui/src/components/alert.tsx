"use client";

import { CircleCheck, Info, OctagonAlert, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { ComponentPropsWithRef, ReactNode } from "react";

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

export interface AlertProps extends Omit<ComponentPropsWithRef<"div">, "title"> {
  /** `info` (default), `success`, `warning`, or `danger` for a failure (announced at once). */
  tone?: AlertVariant;
  /** The first name for `tone`; still honoured, `tone` wins when both are set. */
  variant?: AlertVariant | null;
  title?: ReactNode;
  /** Replaces the variant's icon. */
  icon?: ReactNode;
  /**
   * One or two `size="sm"` buttons (the main one first, as a fragment) or a
   * link: in a wide alert they sit on the title line beside the close
   * button; in a narrow one (a phone, or a side column on a desktop) under
   * the text, wrapping if they must. A draft offer ("Pulihkan", "Buang") is
   * the two-button case.
   */
  action?: ReactNode;
  /** Shows a close button. */
  onDismiss?: () => void;
  dismissLabel?: string;
}

/*
 * The description is ordinary flow, so a sentence with an inline link, a
 * `strong` or a `code` stays one sentence. A child that follows a block
 * (a second paragraph, a button after the text) starts 8px lower; the rule
 * has no specificity, so a child's own margin still wins.
 */
const DESCRIPTION_CLASS = "text-body-sm [:where(&>:is(p,div,ul,ol,dl)+*)]:mt-2";

/**
 * A message that stays on the page (no active academic year, a failed
 * load, a verified document), as opposed to a toast. Soft tint of its
 * semantic tone, icon, title, description (children) and an action slot.
 */
export function Alert({
  className,
  tone: toneProp,
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
  const tone: AlertVariant = toneProp ?? variant ?? "info";
  const Icon = ICON[tone];
  const colors = TONE_CLASSES[tone];
  const hasDescription = children !== undefined && children !== null && children !== false;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "@container flex items-start gap-3 rounded-md px-4 py-3",
        colors.soft,
        className,
      )}
      {...props}
    >
      <span className={cn("shrink-0 [&>svg]:size-5", ICON_COLOR[tone])} aria-hidden="true">
        {icon ?? <Icon />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 @md:flex-row @md:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {title !== undefined && <p className="text-body font-semibold">{title}</p>}
          {hasDescription && (
            <div className={cn(DESCRIPTION_CLASS, colors.softMuted)}>{children}</div>
          )}
        </div>
        {/* The trailing controls (the action once the alert is 28rem wide,
            and the close button) sit on the first line of text, as the
            icon does, in every alert: one line or three, titled or not.
            Each slot is as tall as that line and centres its 32px control
            on it, overflowing into the padding instead of pushing the text
            down. In a narrower alert the action drops under the text: the
            width is the alert's own, not the screen's, so a 20rem side
            column on a desktop never squeezes the message into a word per
            line beside the button (audit r3-n16). */}
        {action && (
          <div
            data-slot="alert-action"
            className="flex shrink-0 flex-wrap items-center gap-2 @md:h-5 @md:flex-nowrap"
          >
            {action}
          </div>
        )}
      </div>
      {onDismiss && (
        // Beside an action the two read as one trailing group, 4px apart.
        <div
          data-slot="alert-dismiss"
          className={cn("flex h-5 shrink-0 items-center", action && "@md:-ml-2")}
        >
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel ?? labels.alertDismiss}
            className="-mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-state-hover active:bg-state-pressed pointer-coarse:size-11 pointer-coarse:-mr-3.5"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
