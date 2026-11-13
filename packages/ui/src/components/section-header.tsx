import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { CountBadge } from "./count-badge.js";

export interface SectionHeaderProps extends Omit<ComponentPropsWithoutRef<"div">, "title"> {
  title: ReactNode;
  description?: ReactNode;
  /** A tally next to the title ("Perlu tindakan 3"); zero renders nothing. */
  count?: number;
  /** A "Lihat semua" TextLink or one small button, on the title's baseline. */
  action?: ReactNode;
  /** `h2` by default: a section of the page under its h1. */
  as?: "h2" | "h3" | "h4";
  /** The id of the title, for a `section` labelled by it (`aria-labelledby`). */
  titleId?: string;
}

/**
 * The title of a section of a page (the artboard's "Hari ini" with "Lihat
 * semua"): Manrope on the heading role, an optional count and description,
 * and one action aligned on the title's baseline. Sections are separated by
 * space and this title, not by rules.
 */
export function SectionHeader({
  title,
  description,
  count,
  action,
  as: Heading = "h2",
  titleId,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)} {...props}>
      <div className="flex min-h-6 items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <Heading id={titleId} className="min-w-0 text-heading text-fg">
            {title}
          </Heading>
          {count !== undefined && <CountBadge count={count} className="self-center" />}
        </div>
        {action && <div className="flex shrink-0 items-baseline gap-2">{action}</div>}
      </div>
      {description && <p className="max-w-prose text-body-sm text-fg-muted">{description}</p>}
    </div>
  );
}
