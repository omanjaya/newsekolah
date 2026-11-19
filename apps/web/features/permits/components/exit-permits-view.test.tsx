import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkflowInstance } from "../api";

import { ExitPermitsView } from "./exit-permits-view";

const mocks = vi.hoisted(() => ({
  items: [] as WorkflowInstance[],
  canSubmit: true,
  permissions: [] as string[],
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../components/query-error", () => ({
  QueryError: () => <div data-testid="query-error" />,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => mocks.permissions.includes(permission),
  useSession: () => ({ me: { profile_kind: "student", tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../lib/use-can-submit-permit", () => ({ useCanSubmitPermit: () => mocks.canSubmit }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../api", () => ({
  useMyExitPermitsQuery: () => ({
    data: { data: mocks.items },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
// The card reads the permit's own detail (exited_at and all); here it only
// has to say which permit the page put on it.
vi.mock("./exit-permit-detail", () => ({
  ActiveExitPermitCard: ({ id }: { id: string }) => <div data-testid="status-card">{id}</div>,
  CreateForm: () => null,
  ExitPermitDetail: () => null,
}));
vi.mock("./exit-permit-panels", () => ({ GatePanel: () => <div data-testid="gate-panel" /> }));
vi.mock("./desk-qr-panel", () => ({
  DeskQrPanel: ({ purpose }: { purpose: string }) => <div data-testid="desk-qr">{purpose}</div>,
}));
vi.mock("./review-inbox-banner", () => ({ ReviewInboxBanner: () => null }));

function permit(id: string, status: WorkflowInstance["status"]): WorkflowInstance {
  return {
    id,
    kind: "exit_permit",
    status,
    current_stage_index: 0,
    stages: [],
    subject_user_id: "student-1",
    opened_at: "2026-11-18T02:00:00Z",
  };
}

beforeEach(() => {
  mocks.items = [];
  mocks.canSubmit = true;
  mocks.permissions = [];
});

describe("ExitPermitsView for an approving teacher", () => {
  it("approves the picket stage with the desk's rotating QR instead of a typed permit code", () => {
    mocks.canSubmit = false;
    mocks.permissions = ["issue_scan_tokens"];
    render(<ExitPermitsView />);
    expect(screen.getByTestId("desk-qr")).toHaveTextContent("approve_stage");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gate-panel")).not.toBeInTheDocument();
  });
});

describe("ExitPermitsView for a student", () => {
  it("keeps the permit on the status card once it goes through the gate", () => {
    mocks.items = [permit("p1", "approved")];
    const { rerender } = render(<ExitPermitsView />);
    expect(screen.getByTestId("status-card")).toHaveTextContent("p1");

    // The gate scan completes the permit; the live list says so.
    mocks.items = [permit("p1", "completed")];
    rerender(<ExitPermitsView />);

    expect(screen.getByTestId("status-card")).toHaveTextContent("p1");
    expect(screen.queryByText("idleTitle")).not.toBeInTheDocument();
    // Not listed twice: the card holds it, the history does not.
    expect(screen.queryByText("historyTitle")).not.toBeInTheDocument();
  });

  it("goes back to the request prompt when the permit on the card is cancelled", () => {
    mocks.items = [permit("p1", "in_progress")];
    const { rerender } = render(<ExitPermitsView />);
    expect(screen.getByTestId("status-card")).toHaveTextContent("p1");

    mocks.items = [permit("p1", "cancelled")];
    rerender(<ExitPermitsView />);

    expect(screen.queryByTestId("status-card")).not.toBeInTheDocument();
    expect(screen.getByText("idleTitle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "request" })).toBeInTheDocument();
    expect(screen.getByText("historyTitle")).toBeInTheDocument();
  });

  it("opens on the request prompt when no permit is on its way, with past exits in the history", () => {
    mocks.items = [permit("p0", "completed")];
    render(<ExitPermitsView />);

    expect(screen.queryByTestId("status-card")).not.toBeInTheDocument();
    expect(screen.getByText("idleTitle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "request" })).toBeInTheDocument();
    expect(screen.getByText("historyTitle")).toBeInTheDocument();
  });
});
