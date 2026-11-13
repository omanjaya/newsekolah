"use client";

import {
  Compass,
  PowerOff,
  ShieldAlert,
  TriangleAlert,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import type { ComponentPropsWithRef, ReactElement, ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { IconCircle } from "./icon-circle.js";
import type { Tone } from "./tone.js";
import { useUiLabels } from "./ui-labels.js";

export type StatePageKind = "not-found" | "error" | "forbidden" | "module-unavailable" | "offline";

// Only a failure is coloured as one; a missing page, a switched-off module
// and a lost connection are not the reader's fault and stay neutral.
const KIND: Record<StatePageKind, { icon: LucideIcon; tone: Tone }> = {
  "not-found": { icon: Compass, tone: "neutral" },
  error: { icon: TriangleAlert, tone: "danger" },
  forbidden: { icon: ShieldAlert, tone: "warning" },
  "module-unavailable": { icon: PowerOff, tone: "neutral" },
  offline: { icon: WifiOff, tone: "neutral" },
};

export interface StatePageProps extends Omit<ComponentPropsWithRef<"div">, "title" | "children"> {
  /** Picks the icon and its tone. */
  kind: StatePageKind;
  title: string;
  /** One sentence: what happened and what to do. */
  description?: string;
  /** The way out ("Kembali ke beranda", "Coba lagi"). */
  action?: ReactNode;
  secondaryAction?: ReactNode;
  /** A status or error code for support ("404", an error digest), shown small under the actions. */
  code?: string;
  /** Replaces the kind's icon. */
  icon?: ReactNode;
  /** Fills the viewport (a route without the app shell) instead of the shell's content area. */
  fullScreen?: boolean;
}

/**
 * The full-page state for a 404, an error, a missing permission, a module
 * the school switched off, or no connection: icon in a soft circle, a
 * title, one sentence, the actions, and a small code. The title is the
 * page's h1, since it stands in for the page.
 */
export function StatePage({
  kind,
  title,
  description,
  action,
  secondaryAction,
  code,
  icon,
  fullScreen = false,
  className,
  ...props
}: StatePageProps): ReactElement {
  const labels = useUiLabels();
  const { icon: KindIcon, tone } = KIND[kind];
  const hasActions = Boolean(action) || Boolean(secondaryAction);
  return (
    <div
      data-state-kind={kind}
      className={cn(
        "flex items-center justify-center px-4 py-12",
        fullScreen ? "min-h-dvh" : "min-h-[60dvh]",
        className,
      )}
      {...props}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <IconCircle tone={tone} size="xl">
          {icon ?? <KindIcon />}
        </IconCircle>
        <div className="flex flex-col gap-2">
          <h1 className="text-title text-fg">{title}</h1>
          {description && <p className="text-body text-fg-muted">{description}</p>}
        </div>
        {hasActions && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {action}
            {secondaryAction}
          </div>
        )}
        {code && (
          <p className="text-caption text-fg-muted tabular-nums select-all">
            {labels.statePageCode(code)}
          </p>
        )}
      </div>
    </div>
  );
}
