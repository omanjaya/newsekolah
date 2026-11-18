import { cn } from "@newsekolah/ui";
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from "react";

export type ShellStripTone = "warning" | "info" | "neutral";

const TONE: Record<ShellStripTone, string> = {
  warning: "bg-warning-soft text-warning-soft-fg",
  info: "bg-info-soft text-info-soft-fg",
  neutral: "bg-surface-sunken text-fg",
};

export interface ShellStripProps extends Omit<ComponentPropsWithoutRef<"div">, "title"> {
  tone?: ShellStripTone;
  /** A Lucide icon, sized for you. */
  icon: ReactNode;
  /** One short sentence, always shown. */
  title: ReactNode;
  /** A second clause, shown from the `sm` breakpoint and in the strip's tooltip. */
  detail?: string;
  /** At most one or two compact controls at the end. */
  action?: ReactNode;
}

/**
 * The one pattern for a state the reader must keep in view (testing as
 * another account, a simulated clock, no connection, a new version): a
 * single 40px line under the header, inside its sticky stack, so it stays
 * visible while the page scrolls and never covers the phone's tab bar.
 * Tinted, not boxed: no border or radius competing with the page's cards.
 * The title stays on one line; the detail joins it where there is room and
 * is always in the tooltip.
 */
export function ShellStrip({
  tone = "warning",
  icon,
  title,
  detail,
  action,
  className,
  role = "status",
  ...props
}: ShellStripProps): ReactElement {
  return (
    <div
      role={role}
      className={cn(
        "flex min-h-10 items-center gap-3 px-4 py-1 text-body-sm md:px-6",
        TONE[tone],
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="flex shrink-0 [&>svg]:size-4">
        {icon}
      </span>
      <p className="min-w-0 flex-1 truncate" title={detail}>
        <span className="font-semibold">{title}</span>
        {detail && <span className="hidden sm:inline"> · {detail}</span>}
      </p>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
