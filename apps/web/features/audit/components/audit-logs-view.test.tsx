import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    const [row] = screen.getAllByText("actions.role.update");
    if (row) await user.click(row);
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

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useAuditLogsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityType: undefined }),
    );
    expect(new URLSearchParams(window.location.search).get("entity_type")).toBe("");
  });

  it("sets a date range from the two native date inputs and writes both bounds to the URL", async () => {
    const user = userEvent.setup();
    render(<AuditLogsView />);

    await user.click(screen.getByRole("button", { name: "filters.dateRange" }));
    fireEvent.change(screen.getByLabelText("filters.from"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("filters.to"), { target: { value: "2026-09-15" } });

    expect(mocks.useAuditLogsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: "2026-09-01", to: "2026-09-15" }),
    );
    expect(new URLSearchParams(window.location.search).get("from")).toBe("2026-09-01");
    expect(new URLSearchParams(window.location.search).get("to")).toBe("2026-09-15");
  });

  it("clears both bounds from the date range chip's remove control", async () => {
    window.history.replaceState(null, "", "/audit?from=2026-09-01&to=2026-09-15");
    const user = userEvent.setup();
    render(<AuditLogsView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));

    expect(mocks.useAuditLogsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ from: undefined, to: undefined }),
    );
  });

  it("shows a retry control instead of an empty log when the request fails", () => {
    mocks.useAuditLogsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<AuditLogsView />);
    expect(screen.getAllByRole("button", { name: "actions.retry" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    // The filter bar stays so a failing filter can still be changed or reset.
    expect(screen.getAllByRole("button", { name: /filters\./ }).length).toBeGreaterThan(0);
  });
});
