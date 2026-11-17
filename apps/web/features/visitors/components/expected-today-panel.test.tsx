import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { ExpectedTodayPanel } from "./expected-today-panel";

const mocks = vi.hoisted(() => ({ canManage: false, today: vi.fn(), guests: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canManage,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../../lib/tenant-date", () => ({ todayInZone: mocks.today }));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "teacher-1", name: "Bu Rina" }]);
});
vi.mock("../api", () => ({ useExpectedGuestsQuery: mocks.guests }));
vi.mock("./check-in-form", () => ({
  CheckInForm: ({
    expectedGuestId,
    defaultFullName,
  }: {
    expectedGuestId: string;
    defaultFullName: string;
  }) => (
    <div data-testid="prefill">
      {expectedGuestId}: {defaultFullName}
    </div>
  ),
}));

beforeEach(() => {
  mocks.canManage = false;
  mocks.today.mockReturnValue("2026-09-29");
  mocks.guests.mockReturnValue({
    data: {
      data: [
        {
          id: "scheduled-1",
          full_name: "Wali Murid",
          organization: "Komite",
          purpose: "Pertemuan",
          host_user_id: "teacher-1",
        },
      ],
    },
    isLoading: false,
    isError: false,
  });
});

it("uses the school's date and provides read-only scheduled visitors to readers", () => {
  render(<ExpectedTodayPanel search="" />);
  expect(mocks.today).toHaveBeenCalledWith("Asia/Makassar");
  expect(mocks.guests).toHaveBeenCalledWith("2026-09-29");
  expect(screen.getByText("Wali Murid")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "checkInFor" })).not.toBeInTheDocument();
});

it("checks a scheduled visitor in from the common desk with their details preserved", async () => {
  mocks.canManage = true;
  render(<ExpectedTodayPanel search="komite" />);
  await userEvent.click(screen.getByRole("button", { name: "checkInFor" }));
  expect(screen.getByTestId("prefill")).toHaveTextContent("scheduled-1: Wali Murid");
});

it("says when a search leaves no scheduled visitor, without offering to schedule one", () => {
  mocks.canManage = true;
  render(<ExpectedTodayPanel search="tidak ada" />);
  expect(screen.getByText("todaySearchEmpty")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "scheduleGuest" })).not.toBeInTheDocument();
});

it("offers to schedule a visitor when nobody is expected today", () => {
  mocks.canManage = true;
  mocks.guests.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
  render(<ExpectedTodayPanel search="" />);
  expect(screen.getByText("todayEmptyTitle")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "scheduleGuest" })).toHaveAttribute(
    "href",
    "/visitors/expected",
  );
});
