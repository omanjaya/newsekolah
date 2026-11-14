import { usePathname } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import type { WorkspaceNavItem } from "../components/workspace-nav";
import { activeNavHref } from "../lib/navigation/active-href";

/**
 * A stand-in for `components/workspace-nav` in the tests of an area's
 * navigation wrapper, which check which destinations a reader is offered.
 * It draws every item as a link, a lone one included, so those access
 * boundaries stay visible to queries; the real strip leaves a single item
 * out (tested in components/workspace-nav.test.tsx).
 *
 * vi.mock("../../../components/workspace-nav", () => import("../../../test/workspace-nav-stub"));
 */
export function WorkspaceNav({
  label,
  items,
  actions,
}: {
  label: string;
  items: WorkspaceNavItem[];
  actions?: ReactNode;
}): ReactElement {
  const activeHref = activeNavHref(usePathname(), items);
  return (
    <div>
      <nav aria-label={label}>
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            aria-current={(item.active ?? item.href === activeHref) ? "page" : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
      {actions}
    </div>
  );
}
