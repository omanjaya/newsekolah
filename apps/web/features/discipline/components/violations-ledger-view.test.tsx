import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pickDate } from "../../../test/pick-date";

const mocks = vi.hoisted(() => ({
  useViolationsQuery: vi.fn(),
  canRecord: true,
  push: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/discipline/violations",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canRecord,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({
    data: {
      data: [
        { id: "class-7a", name: "7A" },
        { id: "class-7b", name: "7B" },
      ],
    },
    isLoading: false,
  }),
  useLookup: () => new Map(),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("../api", () => ({
  useViolationsQuery: mocks.useViolationsQuery,
  useIssueWarningLetterMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useVoidViolationMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ViolationsLedgerView } from "./violations-ledger-view";

describe("ViolationsLedgerView filters", () => {
  beforeEach(() => {
    mocks.canRecord = true;
    mocks.useViolationsQuery.mockReset();
    mocks.useViolationsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/discipline/violations");
  });

  it("passes the chosen class to the violations query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<ViolationsLedgerView recording={false} onRecordingChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "filters.class" }));
    await user.click(await screen.findByRole("button", { name: "7B" }));

    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: "class-7b" }),
      { limit: 50, offset: 0, search: "" },
    );
    expect(new URLSearchParams(window.location.search).get("class_id")).toBe("class-7b");
  });

  it("toggles the include-voided filter directly and writes include_voided=true to the URL", async () => {
    const user = userEvent.setup();
    render(<ViolationsLedgerView recording={false} onRecordingChange={vi.fn()} />);

    const toggle = screen.getByRole("button", { name: "filters.includeVoided" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);

    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeVoided: true }),
      { limit: 50, offset: 0, search: "" },
    );
    expect(new URLSearchParams(window.location.search).get("include_voided")).toBe("true");
  });

  it("reads an initial class_id URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/discipline/violations?class_id=class-7a");
    render(<ViolationsLedgerView recording={false} onRecordingChange={vi.fn()} />);

    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: "class-7a" }),
      { limit: 50, offset: 0, search: "" },
    );
    expect(screen.getByRole("button", { name: "filters.class: 7A" })).toBeInTheDocument();
  });

  it("clears an active filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/discipline/violations?include_voided=true");
    const user = userEvent.setup();
    render(<ViolationsLedgerView recording={false} onRecordingChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^Hapus filter / }));
    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeVoided: false }),
      { limit: 50, offset: 0, search: "" },
    );
    expect(new URLSearchParams(window.location.search).get("include_voided")).toBe("");
  });

  it("sets a date range from the two date pickers and writes both bounds to the URL", async () => {
    const user = userEvent.setup();
    render(<ViolationsLedgerView recording={false} onRecordingChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "filters.dateRange" }));
    await pickDate(user, "filters.from", "2026-09-01");
    await pickDate(user, "filters.to", "2026-09-15");

    expect(mocks.useViolationsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: "2026-09-01", to: "2026-09-15" }),
      { limit: 50, offset: 0, search: "" },
    );
    expect(new URLSearchParams(window.location.search).get("from")).toBe("2026-09-01");
    expect(new URLSearchParams(window.location.search).get("to")).toBe("2026-09-15");
  });
});

describe("ViolationsLedgerView rows and empty state", () => {
  beforeEach(() => {
    mocks.canRecord = true;
    mocks.push.mockReset();
    mocks.useViolationsQuery.mockReset();
    window.history.replaceState(null, "", "/discipline/violations");
  });

  it("opens a row on the student's discipline record, the page whose trail leads back here", async () => {
    mocks.useViolationsQuery.mockReturnValue({
      data: {
        data: [
          {
            id: "record-1",
            student_user_id: "student-1",
            type_name: "Late",
            points: 5,
            occurred_on: "2026-09-10",
            is_voided: false,
          },
        ],
      },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<ViolationsLedgerView recording={false} onRecordingChange={vi.fn()} />);

    // The phone card's tap target, named after the row's title cell.
    await user.click(screen.getByRole("button", { name: "unknownStudent" }));
    expect(mocks.push).toHaveBeenCalledWith("/discipline/students/student-1");
  });

  it("repeats the header's record action as a secondary button on the empty list", () => {
    mocks.useViolationsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    render(<ViolationsLedgerView recording={false} onRecordingChange={vi.fn()} />);
    // Secondary: the surface fill, not the accent of the header's primary.
    const button = screen.getByRole("button", { name: "record" });
    expect(button).toHaveClass("bg-surface");
    expect(button).not.toHaveClass("bg-accent");
  });
});
