"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactElement } from "react";

import { cn } from "../utils/cn.js";

import { useUiLabels } from "./ui-labels.js";
import { UiLink } from "./ui-link.js";

export interface BreadcrumbItem {
  label: string;
  /** Leave it off the current page. */
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Accessible name of the trail; UiLabels' `breadcrumbLabel` by default. */
  label?: string;
  className?: string;
}

/**
 * The trail above a page title. On a phone it shortens to the one step
 * back ("< Kelas"), the only part a thumb needs; from 640px up it shows the
 * whole path. Links go through UiLinkProvider, so they navigate on the client.
 */
export function Breadcrumb({ items, label, className }: BreadcrumbProps): ReactElement | null {
  const labels = useUiLabels();
  if (items.length === 0) return null;
  const parentIndex = items.findLastIndex(
    (item, index) => index < items.length - 1 && item.href !== undefined,
  );
  // Without a step back there is nothing to shorten to; show the trail as is.
  const collapses = parentIndex >= 0;

  return (
    <nav aria-label={label ?? labels.breadcrumbLabel} className={className}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-body-sm text-fg-muted">
        {items.map((item, index) => {
          const isParent = index === parentIndex;
          const isCurrent = index === items.length - 1;
          return (
            <li
              key={`${item.label}-${String(index)}`}
              className={cn(
                "flex min-w-0 items-center gap-1",
                collapses && !isParent && "max-sm:hidden",
              )}
            >
              {index > 0 && (
                <ChevronRight
                  className={cn("size-3.5 shrink-0", collapses && "max-sm:hidden")}
                  aria-hidden="true"
                />
              )}
              {isParent && <ChevronLeft className="size-4 shrink-0 sm:hidden" aria-hidden="true" />}
              {item.href !== undefined && !isCurrent ? (
                <UiLink
                  href={item.href}
                  className="truncate rounded-xs transition-colors hover:text-fg hover:underline pointer-coarse:py-3"
                >
                  {item.label}
                </UiLink>
              ) : (
                <span aria-current={isCurrent ? "page" : undefined} className="truncate text-fg">
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
