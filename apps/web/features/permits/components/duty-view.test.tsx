import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  encodeScanPayload: () => "payload",
  useIssueScanTokenMutation: () => ({
    mutate: vi.fn(),
    data: undefined,
    isError: false,
    isPending: true,
  }),
  useLateArrivalQueueQuery: () => ({
    data: { data: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("./exit-permit-panels", () => ({ ApprovePanel: () => null }));
vi.mock("./late-arrivals-view", () => ({ LateArrivalReviewForm: () => null }));
vi.mock("./duty-manual-record-panel", () => ({
  DutyManualRecordPanel: () => <div data-testid="manual-record-form" />,
}));

import { DutyView } from "./duty-view";

describe("DutyView", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/duty");
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
});
