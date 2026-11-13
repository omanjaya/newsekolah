import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "../utils/cn.js";

import { CountBadge } from "./count-badge.js";

export interface SectionHeaderProps extends Omit<ComponentPropsWithRef<"div">, "title"> {
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
 * and one action on the title's line. Sections are separated by
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
      {/* Centred rather than baseline-aligned: a button with a leading
          icon has no text baseline of its own, and a centred 18px link
          lands within a pixel of the title's baseline anyway. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Heading id={titleId} className="min-w-0 text-heading text-fg">
            {title}
          </Heading>
          {count !== undefined && <CountBadge count={count} />}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      {description && <p className="max-w-prose text-body-sm text-fg-muted">{description}</p>}
    </div>
  );
}
