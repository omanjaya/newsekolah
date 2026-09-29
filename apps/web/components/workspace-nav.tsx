"use client";

import { cn } from "@newsekolah/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { activeNavHref } from "../lib/navigation/active-href";

export interface WorkspaceNavItem {
  href: string;
  label: string;
  active?: boolean;
}

/** Contextual destinations keep their URLs, browser history and route guards. */
export function WorkspaceNav({
  label,
  items,
  actions,
}: {
  label: string;
  items: WorkspaceNavItem[];
  actions?: ReactNode;
}): ReactElement {
  const pathname = usePathname();
  const activeHref = activeNavHref(pathname, items);
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <nav aria-label={label} className="flex min-w-0 flex-wrap gap-1">
        {items.map((item) => {
          const active = item.active ?? item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-sm px-3 py-2 text-[13px] font-medium",
                active ? "bg-accent/12 text-fg" : "text-fg-muted hover:bg-accent/8 hover:text-fg",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
