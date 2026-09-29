import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
vi.mock("../../../lib/view-state/view-state-provider", () => ({
  useRememberedViewState: () => ["", vi.fn()],
}));
vi.mock("../../reference/api", () => ({
  useDirectoryQuery: () => ({
    data: { data: [{ id: "user-1", name: "Budi" }] },
    isLoading: false,
  }),
  useLookup: (items: { id: string; name: string }[] | undefined) =>
    new Map((items ?? []).map((item) => [item.id, item])),
}));
vi.mock("../api", () => ({
  useAuditLogsQuery: mocks.useAuditLogsQuery,
}));

import { AuditLogsView } from "./audit-logs-view";

describe("AuditLogsView filters", () => {
  beforeEach(() => {
    mocks.useAuditLogsQuery.mockReset();
    mocks.useAuditLogsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/audit");
  });

  it("passes the chosen actor to the audit logs query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<AuditLogsView />);

    await user.click(screen.getByRole("button", { name: "filters.actor" }));
    await user.click(await screen.findByRole("button", { name: "Budi" }));

    expect(mocks.useAuditLogsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ actorUserId: "user-1" }),
    );
    expect(new URLSearchParams(window.location.search).get("actor")).toBe("user-1");
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
});
