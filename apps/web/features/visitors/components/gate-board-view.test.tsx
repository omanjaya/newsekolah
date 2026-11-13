import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const checkOutMutate = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.name ? `${key}:${values.name}` : key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/visitors/board",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/hooks/use-quick-action", () => ({ useQuickAction: () => undefined }));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => true,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../student-services/components/service-workspace-nav", () => ({
  VisitorsWorkspaceNav: () => null,
}));
vi.mock("./check-in-form", () => ({ CheckInForm: () => null }));
vi.mock("./expected-today-panel", () => ({ ExpectedTodayPanel: () => null }));
vi.mock("../api", () => ({
  useVisitorBoardQuery: () => ({
    isLoading: false,
    isError: false,
    data: {
      data: [
        {
          overdue: false,
          visit: {
            id: "v1",
            full_name: "Bu Ayu",
            organization: "Dinas",
            purpose: "Rapat",
            badge_number: "07",
            arrived_at: "2026-11-13T23:30:00Z",
          },
        },
      ],
    },
  }),
  useCheckOutVisitMutation: () => ({ mutate: checkOutMutate, isPending: false }),
}));

import { GateBoardView } from "./gate-board-view";

afterEach(() => {
  cleanup();
  checkOutMutate.mockReset();
});

describe("GateBoardView", () => {
  it("asks for confirmation naming the visitor before signing them out", async () => {
    const user = userEvent.setup();
    render(<GateBoardView />);

    await user.click(screen.getByRole("button", { name: "checkOut" }));
    expect(checkOutMutate).not.toHaveBeenCalled();
    expect(await screen.findByText("checkOutDialog.body:Bu Ayu")).toBeInTheDocument();
  });

  it("shows the arrival time in the school timezone", () => {
    render(<GateBoardView />);
    // 23:30 UTC on 13 Nov is 06.30 on 14 Nov in Asia/Jakarta.
    expect(screen.getByText(/14 November 2026 pukul 06\.30/)).toBeInTheDocument();
  });
});
