import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TenantsView } from "./tenants-view";

const suspendMutate = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values?.name ? `${key}:${values.name}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("./platform-nav", () => ({ PlatformNav: () => null }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("./create-tenant-form", () => ({ CreateTenantForm: () => null }));
vi.mock("./tenant-detail-panel", () => ({ TenantDetailSheet: () => null }));
vi.mock("../api", () => ({
  useTenantsQuery: () => ({
    isLoading: false,
    data: {
      data: [
        {
          id: "tenant-1",
          slug: "sma-contoh",
          name: "SMA Contoh",
          education_level: "sma",
          status: "active",
          user_count: 12,
          active_academic_year: "2026/2027",
          last_activity_at: "2026-11-13T23:30:00Z",
        },
        {
          id: "tenant-2",
          slug: "smp-baru",
          name: "SMP Baru",
          education_level: "smp",
          status: "trial",
          user_count: 3,
        },
      ],
    },
  }),
  useSuspendTenantMutation: () => ({ mutate: suspendMutate, isPending: false }),
  useResumeTenantMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(() => {
  cleanup();
  suspendMutate.mockReset();
});

describe("TenantsView", () => {
  it("asks for confirmation naming the school before suspending it", async () => {
    const user = userEvent.setup();
    render(<TenantsView />);

    const [actions] = screen.getAllByRole("button", { name: "rowActions:SMA Contoh" });
    if (!actions) throw new Error("actions button missing");
    await user.click(actions);
    await user.click(await screen.findByRole("menuitem", { name: "suspend" }));

    expect(suspendMutate).not.toHaveBeenCalled();
    expect(await screen.findByText("suspendDialog.body:SMA Contoh")).toBeInTheDocument();
  });

  it("shows the last activity in the operator timezone, not the browser's", () => {
    render(<TenantsView />);
    // 23:30 UTC on 13 Nov is 07:30 on 14 Nov in Asia/Makassar (UTC+8).
    expect(screen.getAllByText(/14 November 2026 pukul 07.30/).length).toBeGreaterThan(0);
  });

  it("narrows the table from a summary figure", async () => {
    const user = userEvent.setup();
    render(<TenantsView />);
    expect(screen.getAllByText("SMP Baru").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /summary.active/ }));
    expect(screen.queryByText("SMP Baru")).not.toBeInTheDocument();
    expect(screen.getAllByText("SMA Contoh").length).toBeGreaterThan(0);
  });
});
