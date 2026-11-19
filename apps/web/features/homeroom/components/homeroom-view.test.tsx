import { ApiError } from "@newsekolah/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useHomeroomAttendanceQuery: vi.fn(),
  permissions: new Set<string>(),
  disabledModules: [] as string[],
  rememberedSearch: "",
  date: "2026-09-29",
  setDate: vi.fn(),
  attentionRows: [] as unknown[],
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => "Sen, 28 Sep" }),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "class-1", name: "X-A" }] } }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/homeroom",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/hooks/use-date-filter", () => ({
  useDateFilter: () => [mocks.date, mocks.setDate],
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
vi.mock("./homeroom-dashboard", () => ({
  HomeroomDashboard: ({ attentionRows }: { attentionRows: unknown[] }) => {
    mocks.attentionRows = attentionRows;
    return null;
  },
}));
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

  // Each filter tried was a Back step of its own (audit r5-n4).
  it("replaces the history entry when the status filter changes", async () => {
    const user = userEvent.setup();
    render(<HomeroomView />);
    const before = window.history.length;

    await user.click(screen.getByRole("button", { name: "statusFilterLabel" }));
    await user.click(await screen.findByRole("button", { name: "codes.A" }));

    expect(new URLSearchParams(window.location.search).get("status")).toBe("A");
    expect(window.history.length).toBe(before);
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
    mocks.date = "2026-09-29";
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

  // The tab and the filter were two pushes, so the first Back landed on
  // the summary carrying a hidden status filter (audit r5-n4).
  it("opens a list from the summary in one history step, leaving the summary entry as it was", async () => {
    const user = userEvent.setup();
    render(<HomeroomView />);
    const before = window.history.length;

    await user.click(screen.getByRole("button", { name: /statAbsent/ }));

    expect(window.history.length).toBe(before + 1);
    const params = new URLSearchParams(window.location.search);
    expect(params.get("tab")).toBe("attendance");
    expect(params.get("status")).toBe("A");
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

  // A weekend read as "everyone accounted for" (audit r4-n4).
  it("says the class has no lessons on a day without any, not that everyone is accounted for", () => {
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: {
        data: [
          { student_user_id: "s1", name: "Siswa Satu", status_code: "NONE" },
          { student_user_id: "s2", name: "Siswa Dua", status_code: "NONE" },
        ],
        total: 2,
        status_counts: { NONE: 2 },
      },
      isLoading: false,
    });
    render(<HomeroomView />);

    expect(screen.getByRole("heading", { name: "noLessonsTitle" })).toBeInTheDocument();
    expect(screen.getByText("noLessonsMeta")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "attentionNoneTitle" })).not.toBeInTheDocument();
  });

  // "pada hari ini" means today, not the chosen day (audit r5-n1).
  it("names the chosen day when another day has no lessons", () => {
    mocks.date = "2026-09-26";
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: {
        data: [{ student_user_id: "s1", name: "Siswa Satu", status_code: "NONE" }],
        total: 1,
        status_counts: { NONE: 1 },
      },
      isLoading: false,
    });
    render(<HomeroomView />);

    expect(screen.getByText("noLessonsMetaOn")).toBeInTheDocument();
    expect(screen.queryByText("noLessonsMeta")).not.toBeInTheDocument();
  });

  // The API reports a day still to come as INCOMPLETE: its sessions are
  // not submitted because they have not happened (audit r6-n4).
  it("lists nobody for a guardian call on a day still to come", async () => {
    mocks.date = "2026-09-30";
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: {
        data: [
          {
            student_user_id: "s1",
            name: "Siswa Satu",
            status_code: "INCOMPLETE",
            complete: false,
            submitted_sessions: 0,
            expected_sessions: 2,
          },
        ],
        total: 1,
        status_counts: { INCOMPLETE: 1 },
      },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<HomeroomView />);

    expect(screen.getByRole("heading", { name: "upcomingTitle" })).toBeInTheDocument();
    expect(screen.queryByText("attentionTitleOn")).not.toBeInTheDocument();
    // No guardian to call: the contact card gets nobody.
    expect(mocks.attentionRows).toEqual([]);

    await user.click(screen.getByRole("tab", { name: "tabs.attendance" }));
    expect(screen.getAllByText("upcomingCode").length).toBeGreaterThan(0);
    expect(screen.queryByText("codes.INCOMPLETE")).not.toBeInTheDocument();
  });

  it("names the chosen day instead of 'today' on another date", () => {
    mocks.date = "2026-09-28";
    const { unmount } = render(<HomeroomView />);
    expect(screen.getByText("attentionTitleOn")).toBeInTheDocument();
    expect(screen.queryByText("attentionTitle")).not.toBeInTheDocument();
    unmount();

    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: { data: [], total: 1, status_counts: { H: 1 } },
      isLoading: false,
    });
    render(<HomeroomView />);
    const hero = screen
      .getByRole("heading", { name: "attentionNoneTitle" })
      .closest("section, div");
    expect(hero?.parentElement).toHaveTextContent("Sen, 28 Sep");
  });

  // Radix shows the chosen panel a render after the tab changes, and a
  // browser does not focus a hidden element: focusing it at once left
  // focus on <body> (audit r4-r3-n22). jsdom focuses hidden elements, so
  // the test refuses them as a browser does.
  it("moves focus to the class attendance list when a stat cell opens it", async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called with its element below
    const realFocus = HTMLElement.prototype.focus;
    const spy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
      this: HTMLElement,
      options?: FocusOptions,
    ) {
      if (this.closest("[hidden]")) return;
      realFocus.call(this, options);
    });
    try {
      const user = userEvent.setup();
      render(<HomeroomView />);

      await user.click(screen.getByRole("button", { name: /statAbsent/ }));

      await waitFor(() => {
        expect(screen.getByRole("tabpanel")).toHaveFocus();
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("says the day did not load instead of a false all-clear, with one retry", async () => {
    const refetch = vi.fn();
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error("500"),
      refetch,
    });
    const user = userEvent.setup();
    render(<HomeroomView />);

    expect(screen.getByRole("heading", { name: "loadFailedTitle" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "attentionNoneTitle" })).not.toBeInTheDocument();
    // The day's three figures are unknown, not zero; the leave queue loaded.
    const stats = screen.getByRole("group", { name: "statsLabel" });
    expect(within(stats).getAllByText("-")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "actions.retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  // A 403 for a day outside the homeroom term read as a connection error
  // with a retry that could never succeed (audit r5-n5).
  it("explains a day outside the homeroom term, with no retry", async () => {
    mocks.date = "2026-07-04";
    mocks.setDate.mockReset();
    const refetch = vi.fn();
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new ApiError({ status: 403, code: "ATTENDANCE_NOT_HOMEROOM", message: "forbidden" }),
      refetch,
    });
    const user = userEvent.setup();
    const { unmount } = render(<HomeroomView />);

    expect(screen.getByRole("heading", { name: "outOfTermTitle" })).toBeInTheDocument();
    expect(screen.getByText("outOfTermMeta")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "loadFailedTitle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "actions.retry" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "outOfTermAction" }));
    expect(mocks.setDate).toHaveBeenCalledWith("2026-09-29");
    unmount();

    // The dated tabs say the same instead of the table's or the list's error.
    for (const tab of ["attendance", "parents"]) {
      window.history.replaceState(null, "", `/homeroom?tab=${tab}`);
      const view = render(<HomeroomView />);
      expect(screen.getByText("outOfTermTitle")).toBeInTheDocument();
      expect(screen.queryByText("parents-panel")).not.toBeInTheDocument();
      view.unmount();
    }
  });

  // The button went away with the notice once today loaded, and focus fell
  // to <body> (audit r5-n5, the r3-n22 class).
  it("keeps focus in the tab's panel after stepping back to today", async () => {
    mocks.date = "2026-07-04";
    const outOfTerm = {
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new ApiError({ status: 403, code: "ATTENDANCE_NOT_HOMEROOM", message: "forbidden" }),
      refetch: vi.fn(),
    };
    const loaded = {
      data: { data: [], total: 0, status_counts: {} },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    for (const tab of ["overview", "attendance", "parents"]) {
      window.history.replaceState(null, "", `/homeroom?tab=${tab}`);
      mocks.useHomeroomAttendanceQuery.mockReturnValue(outOfTerm);
      const user = userEvent.setup();
      const view = render(<HomeroomView />);

      await user.click(screen.getByRole("button", { name: "outOfTermAction" }));
      mocks.useHomeroomAttendanceQuery.mockReturnValue(loaded);
      view.rerender(<HomeroomView />);

      expect(screen.queryByRole("button", { name: "outOfTermAction" })).not.toBeInTheDocument();
      expect(document.activeElement).not.toBe(document.body);
      expect(screen.getByRole("tabpanel")).toHaveFocus();
      view.unmount();
    }
    mocks.date = "2026-09-29";
  });

  it("offers no way back to today when today itself is outside the term", () => {
    mocks.useHomeroomAttendanceQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new ApiError({ status: 403, code: "ATTENDANCE_NOT_HOMEROOM", message: "forbidden" }),
      refetch: vi.fn(),
    });
    render(<HomeroomView />);

    expect(screen.getByRole("heading", { name: "outOfTermTitle" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "outOfTermAction" })).not.toBeInTheDocument();
  });
});
