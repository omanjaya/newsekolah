import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SupervisionWorkspaceNav } from "./supervision-workspace-nav";

const session = vi.hoisted(() => ({ profile_kind: "teacher", permissions: [] as string[] }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ usePathname: () => "/supervision/cycles/cycle-1/report" }));
// Every offered destination as a link, a lone one included: these tests
// check access boundaries, not how the strip draws a single item.
vi.mock("../../../components/workspace-nav", () => import("../../../test/workspace-nav-stub"));
vi.mock("../../../lib/session/session-provider", () => ({ useSession: () => ({ me: session }) }));

// Each tab is named by its navigation registry entry (the mock returns the key).
const MY_SUPERVISION = "app.supervision.navLabelMyReport";
const CYCLES = "app.supervision.navLabelCycles";

describe("supervision workspace access", () => {
  beforeEach(() => {
    session.profile_kind = "teacher";
    session.permissions = ["view_supervision"];
  });

  it("keeps personal results and observation cycles available for a teacher", () => {
    render(<SupervisionWorkspaceNav />);
    expect(screen.getByRole("link", { name: MY_SUPERVISION })).toHaveAttribute(
      "href",
      "/supervision/my-report",
    );
    expect(screen.getByRole("link", { name: CYCLES })).toHaveAttribute("aria-current", "page");
  });

  it("does not suggest a personal teacher report to a staff administrator", () => {
    session.profile_kind = "staff";
    render(<SupervisionWorkspaceNav />);
    expect(screen.queryByRole("link", { name: MY_SUPERVISION })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: CYCLES })).toBeInTheDocument();
  });

  it("requires supervision permission even for a teacher", () => {
    session.permissions = [];
    render(<SupervisionWorkspaceNav />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
