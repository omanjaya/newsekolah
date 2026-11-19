import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useHomeroomAttendanceQuery: vi.fn(),
  permissions: new Set<string>(),
  disabledModules: [] as string[],
  rememberedSearch: "",
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "class-1", name: "X-A" }] } }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/homeroom",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/hooks/use-date-filter", () => ({
  useDateFilter: (_key: string, fallback: string) => [fallback, vi.fn()],
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => mocks.permissions.has(permission),
  useSession: () => ({
    me: {
      id: "me-1",
      tenant: { timezone: "Asia/Jakarta" },
      duties: [{ slug: "homeroom", scope_id: "class-1", scope_label: "X-A" }],
      disabled_modules: mocks.disabledModules,
      permissions: [],
      roles: [],
      profile_kind: "teacher",
      modules: [],
    },
  }),
}));
vi.mock("../../../lib/view-state/view-state-provider", async () => {
  const { useState } = await import("react");
  return {
    useRememberedViewState: () => useState(mocks.rememberedSearch),
  };
});
vi.mock("../../attendance/api", () => ({
  todayInZone: () => "2026-09-29",
  useHomeroomAttendanceQuery: mocks.useHomeroomAttendanceQuery,
}));
vi.mock("../../attendance/lib/status-tokens", () => ({ statusToken: () => undefined }));
vi.mock("../../permits/api", () => ({
  useLeaveReviewQueueQuery: () => ({ data: { data: [] }, isLoading: false }),
}));
vi.mock("./homeroom-dashboard", () => ({ HomeroomDashboard: () => null }));
vi.mock("./homeroom-permits-tab", () => ({ HomeroomPermitsTab: () => <div>permits-panel</div> }));
vi.mock("./homeroom-discipline-tab", () => ({
  HomeroomDisciplineTab: () => <div>discipline-panel</div>,
}));
vi.mock("./homeroom-parents-tab", () => ({ HomeroomParentsTab: () => <div>parents-panel</div> }));

import { HomeroomView } from "./homeroom-view";

/**
 * HomeroomView calls `useHomeroomAttendanceQuery` twice (the filtered
 * roster, then the dashboard's always-unfiltered full-class query), so
 * asserting on the mock's last call is order-dependent. This picks the
 * roster call specifically, by its distinguishing `statusCode` key.
 */
function lastRosterCallArgs(): [unknown, unknown] | undefined {
  const calls = mocks.useHomeroomAttendanceQuery.mock.calls as unknown as [unknown, unknown][];
  return [...calls]
    .reverse()
    .find(([arg]) => typeof arg === "object" && arg !== null && "statusCode" in arg);
}

describe("HomeroomView filters", () => {
  beforeEach(() => {
    mocks.useHomeroomAttendanceQuery.mockReset();
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: { data: [], total: 0, status_counts: {} },
      isLoading: false,
    });
    mocks.permissions = new Set();
    window.history.replaceState(null, "", "/homeroom?tab=attendance");
  });

  it("passes the chosen status to the attendance query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<HomeroomView />);

    await user.click(screen.getByRole("button", { name: "statusFilterLabel" }));
    await user.click(await screen.findByRole("button", { name: "codes.A" }));

    expect(lastRosterCallArgs()).toEqual([expect.objectContaining({ statusCode: "A" }), true]);
    expect(new URLSearchParams(window.location.search).get("status")).toBe("A");
  });

  it("reads an initial status=INCOMPLETE URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/homeroom?tab=attendance&status=INCOMPLETE");
    render(<HomeroomView />);

    expect(lastRosterCallArgs()).toEqual([
      expect.objectContaining({ statusCode: "INCOMPLETE" }),
      true,
    ]);
    expect(
      screen.getByRole("button", { name: "statusFilterLabel: codes.INCOMPLETE" }),
    ).toBeInTheDocument();
  });

  it("clears the status filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/homeroom?tab=attendance&status=A");
    const user = userEvent.setup();
    render(<HomeroomView />);

    await user.click(screen.getByRole("button", { name: /^Hapus filter / }));

    expect(lastRosterCallArgs()).toEqual([
      expect.objectContaining({ statusCode: undefined }),
      true,
    ]);
    expect(new URLSearchParams(window.location.search).get("status")).toBeNull();
  });
});

describe("HomeroomView tabs", () => {
  beforeEach(() => {
    mocks.permissions = new Set();
    mocks.useHomeroomAttendanceQuery.mockReset();
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: { data: [], total: 0, status_counts: {} },
      isLoading: false,
    });
    window.history.replaceState(null, "", "/homeroom");
  });

  it("shows the overview, attendance, permits and parents tabs without discipline access", () => {
    render(<HomeroomView />);

    for (const name of ["overview", "attendance", "permits", "parents"]) {
      expect(screen.getByRole("tab", { name: `tabs.${name}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole("tab", { name: "tabs.discipline" })).not.toBeInTheDocument();
  });

  it("shows the day stepper only on the tabs that read the chosen day", () => {
    const { unmount } = render(<HomeroomView />);
    expect(screen.getByRole("button", { name: "prevDay" })).toBeInTheDocument();
    unmount();

    window.history.replaceState(null, "", "/homeroom?tab=permits");
    render(<HomeroomView />);
    expect(screen.getByText("permits-panel")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "prevDay" })).not.toBeInTheDocument();
  });

  it("adds the discipline tab with view_discipline", () => {
    mocks.permissions = new Set(["view_discipline"]);
    render(<HomeroomView />);

    expect(screen.getByRole("tab", { name: "tabs.discipline" })).toBeInTheDocument();
  });

  it("opens the tab named in the URL and falls back to overview for an unknown one", () => {
    window.history.replaceState(null, "", "/homeroom?tab=parents");
    const { unmount } = render(<HomeroomView />);
    expect(screen.getByText("parents-panel")).toBeInTheDocument();
    unmount();

    window.history.replaceState(null, "", "/homeroom?tab=discipline");
    render(<HomeroomView />);
    expect(screen.queryByText("discipline-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tabs.overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("HomeroomView roster with discipline switched off", () => {
  beforeEach(() => {
    mocks.permissions = new Set();
    mocks.disabledModules.length = 0;
    mocks.useHomeroomAttendanceQuery.mockReset();
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: {
        data: [{ student_user_id: "s-1", name: "Ayu", status_code: "H", violation_count: 0 }],
        total: 1,
        status_counts: { H: 1 },
      },
      isLoading: false,
    });
    window.history.replaceState(null, "", "/homeroom?tab=attendance");
  });

  it("shows the violations column while discipline is on", () => {
    render(<HomeroomView />);
    expect(screen.getAllByText("columns.violations").length).toBeGreaterThan(0);
  });

  it("leaves the violations column out while discipline is off", () => {
    mocks.disabledModules.push("discipline");
    render(<HomeroomView />);
    expect(screen.queryByText("columns.violations")).not.toBeInTheDocument();
    expect(screen.queryByText("noViolations")).not.toBeInTheDocument();
  });
});

describe("HomeroomView overview", () => {
  beforeEach(() => {
    mocks.disabledModules.length = 0;
    mocks.rememberedSearch = "";
    mocks.useHomeroomAttendanceQuery.mockReset();
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: {
        data: [
          { student_user_id: "s1", name: "Siswa Satu", status_code: "A" },
          { student_user_id: "s2", name: "Siswa Dua", status_code: "H" },
        ],
        total: 2,
        status_counts: { A: 1, H: 1 },
      },
      isLoading: false,
    });
    window.history.replaceState(null, "", "/homeroom");
  });

  it("opens on who needs attention today, and lists them in class attendance", async () => {
    const user = userEvent.setup();
    render(<HomeroomView />);

    expect(screen.getByRole("heading", { name: "attentionCount" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "attentionOpen" }));

    expect(new URLSearchParams(window.location.search).get("tab")).toBe("attendance");
    expect(lastRosterCallArgs()).toEqual([expect.objectContaining({ statusCode: "A" }), true]);
  });

  it("drops a search left from an earlier visit when the hero opens a list", async () => {
    mocks.rememberedSearch = "Budi";
    const user = userEvent.setup();
    render(<HomeroomView />);

    await user.click(screen.getByRole("button", { name: "attentionOpen" }));

    expect(new URLSearchParams(window.location.search).get("tab")).toBe("attendance");
    expect(lastRosterCallArgs()).toEqual([
      expect.objectContaining({ statusCode: "A", search: undefined }),
      true,
    ]);
  });

  it("opens the incomplete list from the hero when nobody is absent", async () => {
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: {
        data: [
          { student_user_id: "s1", name: "Siswa Satu", status_code: "INCOMPLETE" },
          { student_user_id: "s2", name: "Siswa Dua", status_code: "INCOMPLETE" },
        ],
        total: 2,
        status_counts: { A: 0, INCOMPLETE: 2 },
      },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<HomeroomView />);

    await user.click(screen.getByRole("button", { name: "attentionOpen" }));

    expect(new URLSearchParams(window.location.search).get("tab")).toBe("attendance");
    expect(lastRosterCallArgs()).toEqual([
      expect.objectContaining({ statusCode: "INCOMPLETE" }),
      true,
    ]);
  });

  it("opens each attention list from its own stat cell", async () => {
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: {
        data: [
          { student_user_id: "s1", name: "Siswa Satu", status_code: "A" },
          { student_user_id: "s2", name: "Siswa Dua", status_code: "INCOMPLETE" },
        ],
        total: 2,
        status_counts: { A: 1, INCOMPLETE: 1 },
      },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<HomeroomView />);

    await user.click(screen.getByRole("button", { name: /statIncomplete/ }));

    expect(new URLSearchParams(window.location.search).get("tab")).toBe("attendance");
    expect(lastRosterCallArgs()).toEqual([
      expect.objectContaining({ statusCode: "INCOMPLETE" }),
      true,
    ]);
  });

  it("keeps the alarm eyebrow while someone needs attention", () => {
    render(<HomeroomView />);
    expect(screen.getByText("attentionTitle")).toBeInTheDocument();
  });

  it("heads a calm day with a neutral eyebrow instead of an alarm", () => {
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: {
        data: [{ student_user_id: "s2", name: "Siswa Dua", status_code: "H" }],
        total: 1,
        status_counts: { H: 1 },
      },
      isLoading: false,
    });
    render(<HomeroomView />);

    expect(screen.getByRole("heading", { name: "attentionNoneTitle" })).toBeInTheDocument();
    expect(screen.getByText("today")).toBeInTheDocument();
    expect(screen.queryByText("attentionTitle")).not.toBeInTheDocument();
  });
});
