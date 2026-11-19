import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as TenantDate from "../../../lib/tenant-date";
import { pickDate } from "../../../test/pick-date";

const mocks = vi.hoisted(() => ({
  useAuditLogsQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => true }),
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/audit",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { id: "me", tenant: { timezone: "Asia/Jakarta" } } }),
}));
// The school's today, deliberately not the device's, so the calendar must
// take it from the tenant clock rather than `new Date()`.
vi.mock("../../../lib/tenant-date", async (importOriginal) => ({
  ...(await importOriginal<typeof TenantDate>()),
  todayInZone: () => "2020-02-14",
}));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "user-1", name: "Budi" }]);
});
vi.mock("../api", () => ({
  useAuditLogsQuery: mocks.useAuditLogsQuery,
}));
vi.mock("../../settings/components/settings-page", () => ({
  SettingsPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { AuditLogsView } from "./audit-logs-view";

describe("AuditLogsView detail", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/audit");
  });

  it("opens a row in a sheet that lists only the fields that changed", async () => {
    mocks.useAuditLogsQuery.mockReturnValue({
      data: {
        data: [
          {
            id: "log-1",
            occurred_at: "2026-09-01T02:00:00Z",
            actor_user_id: "user-1",
            action: "role.update",
            entity_type: "role",
            entity_id: "role-1",
            before: { name: "Guru", slug: "teacher" },
            after: { name: "Guru mapel", slug: "teacher" },
          },
        ],
      },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<AuditLogsView />);
    // DataTable mounts the phone cards beside the table (CSS shows one of
    // them). A card opens through its overlay button, not its title text,
    // so the row is opened from the table, where the whole row is the target.
    await user.click(within(screen.getByRole("table")).getByText("actions.role.update"));
    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveTextContent("Guru mapel");
    // The unchanged field is not listed as a change.
    expect(sheet).not.toHaveTextContent("slug");
  });
});

describe("AuditLogsView filters", () => {
  beforeEach(() => {
    mocks.useAuditLogsQuery.mockReset();
    mocks.useAuditLogsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/audit");
  });

  it("passes the chosen actor to the audit logs query, writes it to the URL and clears it", async () => {
    const user = userEvent.setup();
    render(<AuditLogsView />);

    await user.click(screen.getByRole("combobox", { name: "filters.actorAll" }));

    expect(mocks.useAuditLogsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ actorUserId: "picked-1" }),
    );
    expect(new URLSearchParams(window.location.search).get("actor")).toBe("picked-1");

    await user.click(screen.getByRole("button", { name: "filters.clearActor" }));

    expect(new URLSearchParams(window.location.search).get("actor")).toBeFalsy();
  });

  it("passes the chosen entity type to the audit logs query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<AuditLogsView />);

    await user.click(screen.getByRole("button", { name: "filters.entityType" }));
    await user.click(await screen.findByRole("button", { name: "entityTypes.role" }));

    expect(mocks.useAuditLogsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityType: "role" }),
    );
    expect(new URLSearchParams(window.location.search).get("entity_type")).toBe("role");
  });

  it("clears an active filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/audit?entity_type=tenant");
    const user = userEvent.setup();
    render(<AuditLogsView />);

    await user.click(screen.getByRole("button", { name: /^Hapus filter / }));
    expect(mocks.useAuditLogsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityType: undefined }),
    );
    expect(new URLSearchParams(window.location.search).get("entity_type")).toBeNull();
  });

  it("sends the picked days as the school's day bounds and writes both dates to the URL", async () => {
    const user = userEvent.setup();
    render(<AuditLogsView />);

    await user.click(screen.getByRole("button", { name: "filters.dateRange" }));
    await pickDate(user, "filters.from", "2026-09-01");
    await pickDate(user, "filters.to", "2026-09-15");

    expect(mocks.useAuditLogsQuery).toHaveBeenLastCalledWith(
      // Asia/Jakarta (UTC+7): the API takes date-time, so a bare
      // YYYY-MM-DD fails with INVALID_FORMAT.
      expect.objectContaining({
        from: "2026-08-31T17:00:00.000Z",
        to: "2026-09-15T16:59:59.999Z",
      }),
    );
    expect(new URLSearchParams(window.location.search).get("from")).toBe("2026-09-01");
    expect(new URLSearchParams(window.location.search).get("to")).toBe("2026-09-15");
  });

  it("marks the school's today, not the device's, in the date range calendars", async () => {
    const user = userEvent.setup();
    render(<AuditLogsView />);

    await user.click(screen.getByRole("button", { name: "filters.dateRange" }));
    await user.click(screen.getByRole("combobox", { name: "filters.from" }));
    const grid = await screen.findByRole("grid");

    const marked = within(grid)
      .getAllByRole("gridcell")
      .filter((cell) => cell.getAttribute("aria-current") === "date");
    expect(marked.map((cell) => cell.dataset.date)).toEqual(["2020-02-14"]);
  });

  it("leaves the open end out of the URL and the request when only one bound is set", async () => {
    const user = userEvent.setup();
    render(<AuditLogsView />);

    await user.click(screen.getByRole("button", { name: "filters.dateRange" }));
    await pickDate(user, "filters.from", "2026-09-01");

    expect(mocks.useAuditLogsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: "2026-08-31T17:00:00.000Z", to: undefined }),
    );
    expect(window.location.search).not.toContain("to=");
  });

  it("clears both bounds from the date range chip's remove control", async () => {
    window.history.replaceState(null, "", "/audit?from=2026-09-01&to=2026-09-15");
    const user = userEvent.setup();
    render(<AuditLogsView />);

    await user.click(screen.getByRole("button", { name: /^Hapus filter / }));

    expect(mocks.useAuditLogsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: undefined, to: undefined }),
    );
  });

  it("adds one history entry for a picked preset, so Back never leaves half a range", async () => {
    const user = userEvent.setup();
    render(<AuditLogsView />);
    const push = vi.spyOn(window.history, "pushState");

    await user.click(screen.getByRole("button", { name: "filters.dateRange" }));
    await user.click(await screen.findByRole("button", { name: "last7Days" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(window.location.search).get("from")).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get("to")).toBeTruthy();
    push.mockRestore();
  });

  it("reads a reversed range from the URL in calendar order", () => {
    window.history.replaceState(null, "", "/audit?from=2026-11-19&to=2026-11-01");
    render(<AuditLogsView />);

    expect(mocks.useAuditLogsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: "2026-10-31T17:00:00.000Z",
        to: "2026-11-19T16:59:59.999Z",
      }),
    );
    expect(
      screen.getByRole("button", { name: "filters.dateRange: 1-19 Nov 2026" }),
    ).toBeInTheDocument();
  });

  it("words a from-only range as open-ended", () => {
    window.history.replaceState(null, "", "/audit?from=2026-11-19");
    render(<AuditLogsView />);
    expect(
      screen.getByRole("button", { name: "filters.dateRange: sejak 19 Nov 2026" }),
    ).toBeInTheDocument();
  });

  // The toolbar has filters but no search box.
  it("does not suggest another keyword when the filters match nothing", () => {
    window.history.replaceState(null, "", "/audit?from=2026-11-19");
    render(<AuditLogsView />);
    expect(screen.getAllByText("Ubah atau hapus filter yang aktif.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/kata kunci/)).not.toBeInTheDocument();
  });

  it("shows a retry control instead of an empty log when the request fails", () => {
    mocks.useAuditLogsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<AuditLogsView />);
    // The table's own error state, with its retry (UiLabels.tableRetry).
    expect(screen.getAllByRole("button", { name: "Coba lagi" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    // The filter bar stays so a failing filter can still be changed or reset.
    expect(screen.getAllByRole("button", { name: /filters\./ }).length).toBeGreaterThan(0);
  });
});
