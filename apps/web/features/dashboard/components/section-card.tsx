import { cn } from "@newsekolah/ui";
import type { ReactElement, ReactNode } from "react";

/**
 * Shared shell for a dashboard section: a 16 medium heading, an optional
 * one-line note, and an optional trailing action. Sections are separated by
 * a border rather than a shadow, per DESIGN.md.
 */
export function SectionCard({
  title,
  note,
  action,
  children,
  className,
}: {
  title: string;
  note?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <section className={cn("flex flex-col rounded-sm border border-border bg-surface", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-4 pb-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[16px] font-medium text-fg">{title}</h2>
          {note && <p className="text-[13px] text-fg-muted">{note}</p>}
        </div>
        {action}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}
