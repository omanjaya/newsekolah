import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MyExitPermit } from "../api";

import { ExitPermitsView } from "./exit-permits-view";

interface DeskApproval {
  instanceId: string;
  stage: string;
  studentUserId: string;
}

const mocks = vi.hoisted(() => ({
  items: [] as MyExitPermit[],
  canSubmit: true,
  permissions: [] as string[],
  profileKind: "student",
  onDeskApproved: undefined as ((approval: DeskApproval) => void) | undefined,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.time ? `${key} ${values.time}` : key,
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../components/query-error", () => ({
  QueryError: () => <div data-testid="query-error" />,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => mocks.permissions.includes(permission),
  useSession: () => ({
    me: { profile_kind: mocks.profileKind, tenant: { timezone: "Asia/Makassar" } },
  }),
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
  DeskQrPanel: ({
    purpose,
    onApproved,
  }: {
    purpose: string;
    onApproved?: (approval: DeskApproval) => void;
  }) => {
    mocks.onDeskApproved = onApproved;
    return <div data-testid="desk-qr">{purpose}</div>;
  },
}));
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: (ids: readonly (string | undefined)[]) =>
    new Map(
      ids
        .filter((id): id is string => typeof id === "string")
        .map((id) => [id, { id, name: `Nama ${id}` }]),
    ),
}));
vi.mock("./review-inbox-banner", () => ({ ReviewInboxBanner: () => null }));

function permit(
  id: string,
  status: MyExitPermit["status"],
  extra: Partial<MyExitPermit> = {},
): MyExitPermit {
  return {
    id,
    kind: "exit_permit",
    status,
    current_stage_index: 0,
    stages: [],
    subject_user_id: "student-1",
    opened_at: "2026-11-18T02:00:00Z",
    destination: "Puskesmas",
    ...extra,
  };
}

beforeEach(() => {
  mocks.items = [];
  mocks.canSubmit = true;
  mocks.permissions = [];
  mocks.profileKind = "student";
  mocks.onDeskApproved = undefined;
});

describe("ExitPermitsView for an approving teacher", () => {
  beforeEach(() => {
    mocks.canSubmit = false;
    mocks.profileKind = "teacher";
    mocks.permissions = ["issue_scan_tokens"];
  });

  it("approves the picket stage with the desk's rotating QR instead of a typed permit code", () => {
    render(<ExitPermitsView />);
    expect(screen.getByTestId("desk-qr")).toHaveTextContent("approve_stage");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gate-panel")).not.toBeInTheDocument();
  });

  it("lists each student the desk QR approved, by name", () => {
    render(<ExitPermitsView />);
    expect(screen.getByText("empty")).toBeInTheDocument();

    act(() => {
      mocks.onDeskApproved?.({
        instanceId: "permit-1",
        stage: "duty_teacher",
        studentUserId: "siswa-1",
      });
    });

    expect(screen.getByText("Nama siswa-1")).toBeInTheDocument();
    expect(screen.getByText("kinds.exitApproved")).toBeInTheDocument();
  });
});

describe("ExitPermitsView for staff", () => {
  beforeEach(() => {
    mocks.canSubmit = false;
    mocks.profileKind = "staff";
  });

  it("offers no approval QR to staff without a gate duty, only the no-access page", () => {
    mocks.permissions = ["issue_scan_tokens"];
    render(<ExitPermitsView />);
    expect(screen.getByText("noAccessTitle")).toBeInTheDocument();
    expect(screen.queryByTestId("desk-qr")).not.toBeInTheDocument();
  });

  it("gives staff on the gate duty the gate scanner and no approve tab", () => {
    mocks.permissions = ["issue_scan_tokens", "scan_exit_permits"];
    render(<ExitPermitsView />);
    expect(screen.getByTestId("gate-panel")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "tabApprove" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("desk-qr")).not.toBeInTheDocument();
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

describe("ExitPermitsView history rows", () => {
  it("names each past permit by where the student went, with the day and the gate time", () => {
    mocks.items = [
      permit("p0", "completed", {
        destination: "Apotek",
        exited_at: "2026-11-18T07:49:00Z",
      }),
      permit("p1", "cancelled", { destination: "Rumah" }),
    ];
    render(<ExitPermitsView />);

    const [exited, cancelled] = screen.getAllByRole("listitem");
    expect(exited).toHaveTextContent("Apotek");
    expect(exited).toHaveTextContent("exitedMeta 15.49");
    // On a phone the line breaks between the day and the gate time, never inside one.
    expect(screen.getByText("exitedMeta 15.49")).toHaveClass("truncate");
    expect(exited).not.toHaveTextContent("openedAt");
    // Never through the gate: the request time stands in.
    expect(cancelled).toHaveTextContent("Rumah");
    expect(cancelled).toHaveTextContent("openedAt 10.00");
  });
});
