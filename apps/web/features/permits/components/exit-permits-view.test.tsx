import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ClockModule from "../../../lib/simulation/clock";
import type * as TenantDate from "../../../lib/tenant-date";
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
// The school's today, so the history rows' current year is fixed.
vi.mock("../../../lib/tenant-date", async (importOriginal) => ({
  ...(await importOriginal<typeof TenantDate>()),
  todayInZone: () => "2026-11-19",
}));
// 12.00 on that day in Asia/Makassar, on the business clock.
vi.mock("../../../lib/simulation/clock", async (importOriginal) => ({
  ...(await importOriginal<typeof ClockModule>()),
  useBusinessNow: () => new Date("2026-11-19T04:00:00Z"),
}));
vi.mock("../../reference/api", () => ({
  usePeriodsQuery: () => ({ data: { data: [] } }),
}));
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
  ExitPermitDetail: () => null,
}));
vi.mock("./exit-permit-create-form", () => ({ CreateForm: () => null }));
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
    end_period_id: "period-6",
    return_required: true,
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

/** A permit opened on the school's today (2026-11-19 in Asia/Makassar). */
function todays(
  id: string,
  status: MyExitPermit["status"],
  extra: Partial<MyExitPermit> = {},
): MyExitPermit {
  return permit(id, status, { opened_at: "2026-11-19T01:00:00Z", ...extra });
}

describe("ExitPermitsView for a student", () => {
  it("keeps the permit on the status card once it goes through the gate", () => {
    mocks.items = [todays("p1", "approved")];
    const { rerender } = render(<ExitPermitsView />);
    expect(screen.getByTestId("status-card")).toHaveTextContent("p1");

    // The gate scan completes the permit; the live list says so.
    mocks.items = [todays("p1", "completed")];
    rerender(<ExitPermitsView />);

    expect(screen.getByTestId("status-card")).toHaveTextContent("p1");
    expect(screen.queryByText("idleTitle")).not.toBeInTheDocument();
    // Not listed twice: the card holds it, the history does not.
    expect(screen.queryByText("historyTitle")).not.toBeInTheDocument();
  });

  it("goes back to the request prompt when the permit on the card is cancelled", () => {
    mocks.items = [todays("p1", "in_progress")];
    const { rerender } = render(<ExitPermitsView />);
    expect(screen.getByTestId("status-card")).toHaveTextContent("p1");

    mocks.items = [todays("p1", "cancelled")];
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

  // The regression: after the gate the card fell back to the idle prompt on
  // the next visit, so a student still out had nothing telling them when to
  // be back, and the late return showed nowhere.
  it("keeps a permit the student is still out on today on the status card, on a fresh visit", () => {
    mocks.items = [
      todays("p1", "completed", {
        exited_at: "2026-11-19T02:15:00Z",
        expected_return_at: "2026-11-19T03:00:00Z",
      }),
    ];
    render(<ExitPermitsView />);

    expect(screen.getByTestId("status-card")).toHaveTextContent("p1");
    expect(screen.queryByText("idleTitle")).not.toBeInTheDocument();
  });

  // The regression: once the student was back, or went home, a fresh visit
  // offered "Ajukan izin keluar", and the API refused the request with
  // EXIT_PERMIT_ALREADY_TODAY. Today's permit stays on the card all day.
  it.each([
    [
      "back",
      {
        exited_at: "2026-11-19T02:15:00Z",
        expected_return_at: "2026-11-19T03:00:00Z",
        returned_at: "2026-11-19T02:50:00Z",
      },
    ],
    ["gone home", { exited_at: "2026-11-19T00:15:00Z", return_required: false }],
  ])("keeps today's permit on the card once the student is %s", (_, extra) => {
    mocks.items = [todays("p1", "completed", extra)];
    render(<ExitPermitsView />);

    expect(screen.getByTestId("status-card")).toHaveTextContent("p1");
    expect(screen.queryByRole("button", { name: "request" })).not.toBeInTheDocument();
  });

  it("lets go of a permit from an earlier day, whatever its state", () => {
    mocks.items = [
      permit("p2", "completed", {
        exited_at: "2026-11-18T02:15:00Z",
        expected_return_at: "2026-11-18T03:00:00Z",
      }),
      // Left pending or approved: the API no longer counts it either.
      permit("p1", "approved"),
      permit("p0", "in_progress"),
    ];
    render(<ExitPermitsView />);

    expect(screen.queryByTestId("status-card")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "request" })).toBeInTheDocument();
  });
});

describe("ExitPermitsView history rows", () => {
  // The regression: under the time simulation the expiry job never closed
  // a permit from an earlier day, and its row still said "Berjalan" or
  // "Disetujui" although it could go no further.
  it("reads a permit left open on an earlier day as expired", () => {
    mocks.items = [permit("p1", "approved"), permit("p0", "in_progress")];
    render(<ExitPermitsView />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveTextContent("status.expired");
      expect(row).not.toHaveTextContent("status.approved");
      expect(row).not.toHaveTextContent("status.in_progress");
    }
  });

  it("says when the student came back, and how late", () => {
    mocks.items = [
      permit("p0", "completed", {
        exited_at: "2026-11-18T02:15:00Z",
        expected_return_at: "2026-11-18T03:00:00Z",
        returned_at: "2026-11-18T03:20:00Z",
      }),
    ];
    render(<ExitPermitsView />);

    const [row] = screen.getAllByRole("listitem");
    expect(row).toHaveTextContent("exitedMeta 10.15");
    expect(row).toHaveTextContent("returnedLateMeta 11.20");
  });

  // The row read only "keluar 08.41 · Selesai" for a student never
  // recorded back.
  it("warns when the exit day ended with no return on record", () => {
    mocks.items = [
      permit("p0", "completed", {
        exited_at: "2026-11-18T02:15:00Z",
        expected_return_at: "2026-11-18T03:00:00Z",
      }),
    ];
    render(<ExitPermitsView />);

    const [row] = screen.getAllByRole("listitem");
    expect(row).toHaveTextContent("unrecordedMeta");
  });

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
    // The current year goes unsaid, so the day fits a 320px row whole.
    expect(screen.getAllByText("Rab, 18 Nov").length).toBeGreaterThan(0);
    expect(exited).not.toHaveTextContent("2026");
    // On a phone the line breaks between the day and the gate time, never inside one.
    expect(screen.getByText("exitedMeta 15.49")).toHaveClass("truncate");
    expect(exited).not.toHaveTextContent("openedAt");
    // Never through the gate: the request time stands in.
    expect(cancelled).toHaveTextContent("Rumah");
    expect(cancelled).toHaveTextContent("openedAt 10.00");
  });

  // A permit that never reached the gate carries the longest second fact
  // ("Diajukan pukul 15.49") beside the longest statuses ("Kedaluwarsa",
  // "Dibatalkan"). Neither the day, the request time nor the status may be
  // cut at 320-390px: out of room, the status moves under the text
  // (ListRow keepMetaWhole), and the destination takes up to two lines.
  it.each(["rejected", "expired"] as const)(
    "keeps the day, the request time and the %s status whole",
    (status) => {
      mocks.items = [permit("p0", status, { destination: "Puskesmas, kontrol gigi" })];
      render(<ExitPermitsView />);

      const [row] = screen.getAllByRole("listitem");
      expect(row).toHaveTextContent("openedAt 10.00");
      const body = row?.querySelector("[data-slot=list-row-body]");
      expect(body).toHaveClass("flex-wrap");

      // The destination may wrap to a second line instead of "Puskesmas…".
      const title = screen.getByRole("button", { name: "Puskesmas, kontrol gigi" });
      expect(title).toHaveClass("line-clamp-2");

      // Both facts set the text's floor: each is one whole box, so the
      // column is never narrower than the request time beside the badge.
      const column = title.closest("p")?.parentElement;
      expect(column).toHaveClass("w-min", "grow");
      for (const fact of ["Rab, 18 Nov", "openedAt 10.00"]) {
        const box = screen.getByText(fact).parentElement;
        expect(box).toHaveAttribute("data-meta-fact");
        expect(box).toHaveClass("inline-flex");
        expect(box?.className).not.toMatch(/grid/);
      }

      // The status badge sits in the wrapping line and has no leave to shrink.
      const badge = row?.querySelector<HTMLElement>(
        "[data-slot=list-row-trailing] > [data-slot=badge]",
      );
      expect(badge).toHaveAttribute("data-status", status);
      expect(badge?.parentElement?.parentElement).toBe(body);
      expect(badge?.parentElement).toHaveClass("*:shrink-0");
      expect(badge?.parentElement?.className).not.toMatch(/badge\]\]:(shrink|min-w-0)/);
    },
  );
});
