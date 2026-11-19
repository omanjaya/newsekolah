import { ApiError } from "@newsekolah/api-client";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MonitorView } from "./monitor-view";

interface SnapshotState {
  isError: boolean;
  isLoading: boolean;
  error: unknown;
  data: unknown;
}
let snapshot: SnapshotState = { isError: false, isLoading: false, error: null, data: undefined };

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, string>) =>
        values ? `${key}(${Object.values(values).join("|")})` : key,
      { has: () => false },
    ),
  useFormatter: () => ({
    dateTime: (value: Date, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("en-GB", options).format(value),
  }),
}));
const session = vi.hoisted(() => ({ schoolAdmin: false }));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => false,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/session/school-admin", () => ({
  useIsSchoolAdmin: () => session.schoolAdmin,
}));
vi.mock("../api", () => ({
  useMonitorSocket: () => "live",
  useMonitorSnapshotQuery: () => ({ ...snapshot, refetch: vi.fn() }),
  useMonitorPresenceQuery: () => ({ data: undefined }),
}));

const apiError = (status: number) =>
  new ApiError({ status, code: status === 401 ? "UNAUTHORIZED" : "INTERNAL", message: "x" });

beforeEach(() => {
  localStorage.setItem("newsekolah.monitor.display-token", "tok");
  session.schoolAdmin = false;
});

describe("MonitorView token copy", () => {
  it("sends other readers to the school admin for the token", () => {
    localStorage.removeItem("newsekolah.monitor.display-token");
    render(<MonitorView />);
    expect(screen.getByText("tokenHint")).toBeInTheDocument();
  });

  it("does not send the school admin to themselves", () => {
    session.schoolAdmin = true;
    localStorage.removeItem("newsekolah.monitor.display-token");
    render(<MonitorView />);
    expect(screen.getByText("tokenHintAdmin")).toBeInTheDocument();
    expect(screen.queryByText("tokenHint")).not.toBeInTheDocument();
  });

  it("tells the school admin who sets a refused token", () => {
    session.schoolAdmin = true;
    snapshot = { isError: true, isLoading: false, error: apiError(401), data: undefined };
    render(<MonitorView />);
    expect(screen.getByText("tokenInvalidBodyAdmin")).toBeInTheDocument();
  });
});

describe("MonitorView display", () => {
  it("asks a new device once for the display token", () => {
    localStorage.removeItem("newsekolah.monitor.display-token");
    render(<MonitorView />);
    expect(screen.getByRole("heading", { level: 1, name: "gateTitle" })).toBeInTheDocument();
    const token = screen.getByRole("textbox", { name: "tokenLabel" });
    expect(token).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "tokenSubmit" })).toBeDisabled();
    // Never a GET: a submit before hydration must not put the token in the URL.
    expect(token.closest("form")).toHaveAttribute("method", "post");
  });

  it("leads with the day's counts and lists every class in session", () => {
    snapshot = {
      isError: false,
      isLoading: false,
      error: null,
      data: {
        status_counts: { A: 2, H: 30 },
        sessions: [
          {
            class_name: "X-B",
            subject_name: "IPA",
            teacher_name: "Bu Rina",
            status: "submitted",
          },
          {
            class_name: "X-A",
            subject_name: "Matematika",
            teacher_name: "Pak Budi",
            status: "in_progress",
          },
        ],
      },
    };
    render(<MonitorView />);
    const figures = screen.getAllByRole("definition");
    // Present first, in roster order, whatever order the API sent.
    expect(figures.map((node) => node.textContent)).toEqual(["30", "2"]);
    // Counts and class names are read from across a room: the kiosk roles.
    expect(figures[0]).toHaveClass("text-kiosk-display");
    expect(screen.getByText("X-A")).toHaveClass("text-kiosk-title");
    expect(screen.getByRole("heading", { level: 2, name: "sessionsTitle" })).toBeInTheDocument();
    const classes = screen.getAllByRole("listitem").map((node) => node.textContent);
    expect(classes[0]).toContain("X-A");
    expect(classes[1]).toContain("X-B");
    expect(screen.getByRole("heading", { level: 1, name: "navLabel" })).toBeInTheDocument();
  });

  it("names the current lesson period in the school's time zone", () => {
    snapshot = {
      isError: false,
      isLoading: false,
      error: null,
      data: {
        status_counts: {},
        current_period: {
          name: "Jam ke-3",
          starts_at: "2026-11-19T01:40:00Z",
          ends_at: "2026-11-19T02:20:00Z",
        },
        sessions: [
          {
            class_name: "X-A",
            subject_name: "IPA",
            teacher_name: "Bu Rina",
            status: "in_progress",
          },
        ],
      },
    };
    render(<MonitorView />);
    expect(screen.getByText("currentPeriod(Jam ke-3|08:40|09:20)")).toBeInTheDocument();
  });

  it("lists classes without a lesson apart from the classes in session", () => {
    snapshot = {
      isError: false,
      isLoading: false,
      error: null,
      data: {
        status_counts: {},
        sessions: [
          { class_name: "XII-A", subject_name: "", teacher_name: "", status: "no_schedule" },
          {
            class_name: "X-A",
            subject_name: "IPA",
            teacher_name: "Bu Rina",
            status: "in_progress",
          },
        ],
      },
    };
    render(<MonitorView />);
    const inSession = screen.getByRole("region", { name: "sessionsTitle" });
    expect(within(inSession).getByText("X-A")).toBeInTheDocument();
    expect(within(inSession).queryByText("XII-A")).not.toBeInTheDocument();
    const unscheduled = screen.getByRole("region", { name: /noScheduleTitle/ });
    expect(within(unscheduled).getByText("XII-A")).toBeInTheDocument();
  });

  it("says nothing is in session when every class is without a lesson", () => {
    snapshot = {
      isError: false,
      isLoading: false,
      error: null,
      data: {
        status_counts: {},
        sessions: [
          { class_name: "XII-A", subject_name: "", teacher_name: "", status: "no_schedule" },
        ],
      },
    };
    render(<MonitorView />);
    expect(screen.getByText("noSessionsTitle")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "sessionsTitle" })).not.toBeInTheDocument();
    expect(screen.getByText("XII-A")).toBeInTheDocument();
  });

  it("names a running period that no class has a lesson in", () => {
    // Bell times set, timetables not entered yet.
    snapshot = {
      isError: false,
      isLoading: false,
      error: null,
      data: {
        status_counts: {},
        current_period: {
          name: "Jam ke-3",
          starts_at: "2026-11-19T01:40:00Z",
          ends_at: "2026-11-19T02:20:00Z",
        },
        sessions: [
          { class_name: "XII-A", subject_name: "", teacher_name: "", status: "no_schedule" },
        ],
      },
    };
    render(<MonitorView />);
    expect(screen.getByText("noLessonsInPeriodTitle")).toBeInTheDocument();
    expect(
      screen.getByText("noLessonsInPeriodBody(currentPeriod(Jam ke-3|08:40|09:20))"),
    ).toBeInTheDocument();
    expect(screen.queryByText("noSessionsTitle")).not.toBeInTheDocument();
    expect(screen.getByText("XII-A")).toBeInTheDocument();
  });
});

describe("MonitorView snapshot errors", () => {
  it("blames the token only when the API refused it", () => {
    snapshot = { isError: true, isLoading: false, error: apiError(401), data: undefined };
    render(<MonitorView />);
    expect(screen.getByText("tokenInvalidTitle")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "navLabel" })).toBeInTheDocument();
  });

  it("reports a server failure as a retryable error, not an invalid token", () => {
    snapshot = { isError: true, isLoading: false, error: apiError(500), data: undefined };
    render(<MonitorView />);
    expect(screen.queryByText("tokenInvalidTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
  });
});
