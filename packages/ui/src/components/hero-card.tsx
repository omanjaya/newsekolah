import type { ReactElement, ReactNode } from "react";

import { cn } from "../utils/cn.js";

export interface HeroCardProps {
  eyebrow: string;
  title: string;
  meta?: string;
  chip?: string;
  action?: ReactNode;
  className?: string;
}

/** The "right now" card that opens a home screen: accent-soft surface, one primary action. */
export function HeroCard({
  eyebrow,
  title,
  meta,
  chip,
  action,
  className,
}: HeroCardProps): ReactElement {
  return (
    <section
      className={cn(
        "flex flex-col gap-2 rounded-lg bg-accent-soft px-5 py-5 text-accent-soft-fg md:px-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption font-bold tracking-wide uppercase">{eyebrow}</span>
        {chip && (
          <span className="rounded-full bg-accent px-2.5 py-1 text-caption font-bold text-accent-fg">
            {chip}
          </span>
        )}
      </div>
      <h2 className="text-display">{title}</h2>
      {meta && <p className="text-body">{meta}</p>}
      {action && <div className="mt-1">{action}</div>}
    </section>
  );
}
