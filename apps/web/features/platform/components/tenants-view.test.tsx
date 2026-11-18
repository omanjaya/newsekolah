import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlatformTenancyMode, PlatformTenantHealth } from "../api";

import { TenantsView } from "./tenants-view";

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  queryState: {
    data: undefined as
      { data: PlatformTenantHealth[]; tenancy_mode: PlatformTenancyMode } | undefined,
    isLoading: false,
    isError: false,
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../api", () => ({
  useTenantsQuery: () => ({ ...mocks.queryState, refetch: mocks.refetch }),
  useSuspendTenantMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useResumeTenantMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./create-tenant-form", () => ({ CreateTenantForm: () => null }));
vi.mock("./tenant-detail-panel", () => ({
  TenantDetailPanel: ({ tenantId, multiTenant }: { tenantId: string; multiTenant?: boolean }) => (
    <div data-testid="tenant-detail">{`${tenantId}:${multiTenant ? "multi" : "single"}`}</div>
  ),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

const school: PlatformTenantHealth = {
  id: "8a3f2d1e-0000-4000-8000-000000000001",
  slug: "sman-1",
  name: "SMAN 1 Contoh",
  education_level: "sma",
  timezone: "Asia/Makassar",
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  user_count: 10,
  storage_bucket: "bucket",
};

function loaded(tenancyMode: PlatformTenancyMode) {
  mocks.queryState = {
    data: { data: [school], tenancy_mode: tenancyMode },
    isLoading: false,
    isError: false,
  };
}

async function openRowMenu(user: ReturnType<typeof userEvent.setup>) {
  // DataTable mounts its table and card layouts together, so the row's
  // actions button exists once per layout.
  const [actions] = screen.getAllByRole("button", { name: "columns.actions" });
  if (!actions) throw new Error("no row actions button");
  await user.click(actions);
}

describe("TenantsView", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {
          return undefined;
        }
        unobserve() {
          return undefined;
        }
        disconnect() {
          return undefined;
        }
      },
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    loaded("multi");
  });

  it("shows a load error, not the empty state, when the list fails", async () => {
    const user = userEvent.setup();
    mocks.queryState = { data: undefined, isLoading: false, isError: true };
    render(<TenantsView />);

    expect(screen.queryAllByText("emptyTitle")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "actions.retry" }));
    expect(mocks.refetch).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "add" })).not.toBeInTheDocument();
  });

  it("manages the one school in single-tenant mode", async () => {
    const user = userEvent.setup();
    loaded("single");
    render(<TenantsView />);

    expect(screen.getAllByText("SMAN 1 Contoh").length).toBeGreaterThan(0);
    expect(screen.getByText("subtitleSingle")).toBeInTheDocument();
    expect(screen.queryByText("subtitle")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "add" })).not.toBeInTheDocument();

    await openRowMenu(user);
    expect(screen.queryByRole("menuitem", { name: "suspend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "resume" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "viewDetail" }));

    expect(await screen.findByTestId("tenant-detail")).toHaveTextContent(`${school.id}:single`);
  });

  it("offers provisioning and suspension in multi-tenant mode", async () => {
    const user = userEvent.setup();
    render(<TenantsView />);

    expect(screen.getByText("subtitle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "add" })).toBeInTheDocument();

    await openRowMenu(user);
    expect(screen.getByRole("menuitem", { name: "suspend" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "viewDetail" }));

    expect(await screen.findByTestId("tenant-detail")).toHaveTextContent(`${school.id}:multi`);
  });

  it("formats last activity in the school's timezone and the UI locale", () => {
    mocks.queryState = {
      data: {
        // 16:34 UTC is 00:34 the next day in Asia/Makassar (UTC+8).
        data: [{ ...school, last_activity_at: "2026-11-17T16:34:06Z" }],
        tenancy_mode: "single",
      },
      isLoading: false,
      isError: false,
    };
    render(<TenantsView />);

    expect(screen.getAllByText("18 November 2026 pukul 00.34").length).toBeGreaterThan(0);
    expect(screen.queryByText(/11\/18\/2026/)).not.toBeInTheDocument();
  });

  it("still shows the empty state for a list that loaded with no schools", () => {
    mocks.queryState = {
      data: { data: [], tenancy_mode: "multi" },
      isLoading: false,
      isError: false,
    };
    render(<TenantsView />);

    expect(screen.getAllByText("emptyTitle").length).toBeGreaterThan(0);
  });
});
