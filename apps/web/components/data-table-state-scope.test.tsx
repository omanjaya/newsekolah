import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataTableStateScope } from "./data-table-state-scope";

let pathname = "/inbox";
let userId = "user-1";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("../lib/session/session-provider", () => ({
  useSession: () => ({ me: { id: userId, active_academic_year: { id: "year-1" } } }),
}));

vi.mock("../lib/tenant/tenant-provider", () => ({
  useTenant: () => ({ branding: { tenant_id: "tenant-1" } }),
}));

let mounts = 0;

function ShellProbe() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <nav aria-label="shell">shell</nav>;
}

describe("DataTableStateScope", () => {
  beforeEach(() => {
    mounts = 0;
    pathname = "/inbox";
    userId = "user-1";
  });

  // It wraps the whole (app) shell. A keyed remount on the page or the
  // signed-in identity made the sidebar, header and palette start over on
  // every client navigation (the active marker could not glide, sidebar
  // scroll and focus reset).
  it("keeps the shell under it mounted across page changes", () => {
    const view = render(
      <DataTableStateScope>
        <ShellProbe />
      </DataTableStateScope>,
    );
    const shell = screen.getByRole("navigation", { name: "shell" });

    pathname = "/billing";
    view.rerender(
      <DataTableStateScope>
        <ShellProbe />
      </DataTableStateScope>,
    );
    pathname = "/inbox";
    view.rerender(
      <DataTableStateScope>
        <ShellProbe />
      </DataTableStateScope>,
    );

    expect(mounts).toBe(1);
    expect(screen.getByRole("navigation", { name: "shell" })).toBe(shell);
  });

  it("keeps the shell mounted when the identity resolves or changes", () => {
    const view = render(
      <DataTableStateScope>
        <ShellProbe />
      </DataTableStateScope>,
    );
    userId = "user-2";
    view.rerender(
      <DataTableStateScope>
        <ShellProbe />
      </DataTableStateScope>,
    );
    expect(mounts).toBe(1);
  });
});
