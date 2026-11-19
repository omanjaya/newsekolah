import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mint: vi.fn(),
  issued: undefined as { token: string; expires_at: string } | undefined,
  lateItems: [] as unknown[],
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/duty",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => false,
  useSession: () => ({ me: { profile_kind: "teacher", tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/directory-names", () => ({ useDirectoryNames: () => new Map() }));
vi.mock("../api", () => ({
  encodeScanPayload: (kind: string, id: string, token: string) => `sion:${kind}:${id}:${token}`,
  useIssueScanTokenMutation: () => ({
    mutate: mocks.mint,
    data: mocks.issued,
    isError: false,
    isPending: mocks.issued === undefined,
  }),
  useLateArrivalQueueQuery: () => ({
    data: { data: mocks.lateItems },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("./approve-panel", () => ({
  ApprovePanel: ({ kind, instanceId }: { kind: string; instanceId: string }) => (
    <div data-testid="approve-panel">{`${kind}:${instanceId}`}</div>
  ),
}));
vi.mock("./late-arrivals-view", () => ({
  LateArrivalReviewForm: () => <div data-testid="late-review-form" />,
}));
vi.mock("./duty-manual-record-panel", () => ({
  DutyManualRecordPanel: () => <div data-testid="manual-record-form" />,
}));

import { DutyView } from "./duty-view";

function lateItem(id: string, verification: "manual" | "qr_scan") {
  return {
    instance_id: id,
    student_user_id: `student-${id}`,
    status: "in_progress",
    current_stage_index: verification === "manual" ? 0 : 1,
    current_stage: {
      key: verification === "manual" ? "duty_teacher" : "leadership",
      label: verification === "manual" ? "Guru piket" : "Pimpinan",
      approver_rule: verification === "manual" ? "any_teacher" : "duty:leadership",
      verification,
    },
    reason: "Macet",
    occurrence_number: 1,
    required_action: "none",
    opened_at: "2026-09-29T00:10:00Z",
  };
}

describe("DutyView", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/duty");
    mocks.mint.mockClear();
    mocks.issued = undefined;
    mocks.lateItems = [];
  });

  it("offers three desk modes, so all of them fit one row on a phone", () => {
    render(<DutyView />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByRole("radio", { name: "purposes.manual" })).not.toBeInTheDocument();
  });

  it("records by hand from the page's primary action, in a dialog", async () => {
    render(<DutyView />);
    expect(screen.queryByTestId("manual-record-form")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "purposes.manual" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("manual-record-form")).toBeInTheDocument();
  });

  it("still opens the manual record from an old ?mode=manual link", () => {
    window.history.replaceState(null, "", "/duty?mode=manual");
    render(<DutyView />);
    expect(screen.getByTestId("manual-record-form")).toBeInTheDocument();
    // The open dialog hides the page behind it from assistive tech.
    expect(
      screen.getByRole("radio", { name: "purposes.classroom_entry", hidden: true }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("shows the exit mode as one rotating approval QR bound to no permit, with nothing to type", () => {
    window.history.replaceState(null, "", "/duty?mode=exit");
    mocks.issued = {
      token: "a-forty-three-character-token-nobody-types-x",
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    };
    render(<DutyView />);
    expect(mocks.mint).toHaveBeenCalledWith({ purpose: "approve_stage" });
    expect(screen.getByRole("img", { name: "qrLabel.exit" })).toBeInTheDocument();
    expect(screen.getByText("help.exit")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(mocks.issued.token)).not.toBeInTheDocument();
  });

  it("reviews a late arrival at the picket stage and shows the stage QR for one at a QR stage", async () => {
    mocks.lateItems = [lateItem("a", "manual"), lateItem("b", "qr_scan")];
    render(<DutyView />);

    await userEvent.click(screen.getByRole("button", { name: "review" }));
    expect(screen.getByTestId("late-review-form")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByRole("button", { name: "showQr" }));
    expect(screen.getByTestId("approve-panel")).toHaveTextContent("late_arrival:b");
  });
});
