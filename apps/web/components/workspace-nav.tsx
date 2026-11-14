"use client";

import { cn, NavTabs, type NavTabsLinkProps } from "@newsekolah/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import { activeNavHref } from "../lib/navigation/active-href";

export interface WorkspaceNavItem {
  href: string;
  label: string;
  active?: boolean;
}

function renderNavLink({ href, className, children, ...rest }: NavTabsLinkProps): ReactNode {
  return (
    <Link href={href} className={className} aria-current={rest["aria-current"]}>
      {children}
    </Link>
  );
}

/*
 * Until every view moves to AppPage (which renders this under the header
 * through its `nav` prop), some views still render the strip above their
 * PageHeader. When the very next sibling is a PageHeader (its h1 sits two
 * levels down), the strip and everything after that header move one flex
 * order later, so the page reads title, tabs, content. The DOM order, and
 * with it the focus order, only changes once the view adopts AppPage.
 */
const AFTER_HEADER_ORDER = "[&:has(+*>div>div>h1)]:order-1 [&:has(+*>div>div>h1)+*~*]:order-1";

/**
 * The tabs between the pages of one area (Data Sekolah's accounts and
 * roles, the library's catalogue screens), drawn as the shared `NavTabs`
 * underline strip: one row that scrolls sideways on a phone, the current
 * page marked with `aria-current`, links through next/link so each page
 * keeps its URL, history entry and route guard. A strip of one page is
 * not drawn; contextual buttons (`actions`) sit at its right end, or under
 * it on a phone.
 */
export function WorkspaceNav({
  label,
  items,
  actions,
  className,
}: {
  label: string;
  items: WorkspaceNavItem[];
  actions?: ReactNode;
  className?: string;
}): ReactElement | null {
  const pathname = usePathname();
  const activeHref = activeNavHref(pathname, items);
  const hasTabs = items.length >= 2;
  if (!hasTabs && !actions) return null;
  return (
    <div
      data-slot="workspace-nav"
      className={cn(
        "flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:gap-4",
        hasTabs && "md:shadow-[inset_0_-1px_0_var(--color-line)]",
        AFTER_HEADER_ORDER,
        className,
      )}
    >
      {hasTabs && (
        <NavTabs
          aria-label={label}
          variant="underline"
          className="md:w-auto md:min-w-0 md:flex-1"
          items={items.map((item) => ({
            href: item.href,
            label: item.label,
            current: item.active ?? item.href === activeHref,
          }))}
          renderLink={renderNavLink}
        />
      )}
      {actions && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 md:ml-auto md:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
