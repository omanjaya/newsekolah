import { ApiError } from "@newsekolah/api-client";
import type * as UiModule from "@newsekolah/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FEATURE_MODULES } from "../../../lib/modules/feature-modules";
import type { PlatformModuleFlag, PlatformTenantDetail } from "../api";

import { TenantDetailPanel } from "./tenant-detail-panel";

const TENANT_ID = "8a3f2d1e-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/api/client", () => ({
  useApiClient: () => ({ GET: mocks.get, PUT: mocks.put, POST: mocks.post }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return {
    ...actual,
    useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError }),
  };
});

function detail(overrides: Partial<PlatformTenantDetail> = {}): PlatformTenantDetail {
  return {
    id: TENANT_ID,
    slug: "sman-1",
    name: "SMAN 1",
    education_level: "sma",
    timezone: "Asia/Makassar",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    user_count: 10,
    storage_bucket: "bucket",
    flags: [],
    ...overrides,
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let tenantDetail: PlatformTenantDetail;
let storedFlags: PlatformModuleFlag[];

function renderPanel(props: { multiTenant?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TenantDetailPanel tenantId={TENANT_ID} {...props} />
    </QueryClientProvider>,
  );
}

function flagSwitch(module: string): HTMLElement {
  return screen.getByRole("switch", { name: `modules.${module}` });
}

describe("TenantDetailPanel", () => {
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
    tenantDetail = detail();
    // Only library has a stored row; every other module has none.
    storedFlags = [{ module: "library", enabled: false }];
    mocks.get.mockImplementation(async (path: string) => {
      // A short delay keeps the first render on a cold cache, like a real
      // network request.
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (path === "/v1/platform/tenants/{tenantId}") return tenantDetail;
      if (path === "/v1/platform/tenants/{tenantId}/flags") return { data: [...storedFlags] };
      throw new Error(`unexpected GET ${path}`);
    });
  });

  it("renders one labelled switch per feature module, a missing flag reading as on", async () => {
    renderPanel();

    await screen.findByRole("switch", { name: "modules.visitors" });
    expect(screen.getAllByRole("switch")).toHaveLength(FEATURE_MODULES.length);
    for (const module of FEATURE_MODULES) {
      const sw = flagSwitch(module);
      expect(sw).toHaveAttribute("aria-checked", module === "library" ? "false" : "true");
      expect(sw).toBeEnabled();
    }
  });

  it("shows only the module switches in single-tenant mode", async () => {
    renderPanel({ multiTenant: false });

    await screen.findByRole("switch", { name: "modules.staff_attendance" });
    expect(screen.queryByRole("textbox", { name: "domainTitle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "exportButton" })).not.toBeInTheDocument();
  });

  it("starts the domain field from the stored domain once the detail loads", async () => {
    tenantDetail = detail({ primary_domain: "sekolah.sch.id" });
    renderPanel();

    const input = await screen.findByRole("textbox", { name: "domainTitle" });
    expect(input).toHaveValue("sekolah.sch.id");
    expect(screen.getByRole("button", { name: "domainSave" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "exportButton" })).toBeInTheDocument();
  });

  it("never offers to save an empty domain", async () => {
    const user = userEvent.setup();
    renderPanel();

    const input = await screen.findByRole("textbox", { name: "domainTitle" });
    expect(input).toHaveValue("");
    const save = screen.getByRole("button", { name: "domainSave" });
    expect(save).toBeDisabled();

    await user.type(input, "  ");
    expect(save).toBeDisabled();
    await user.type(input, "baru.sch.id");
    expect(save).toBeEnabled();
  });

  it("shows the requested state and blocks clicks while the save is pending", async () => {
    const user = userEvent.setup();
    const put = deferred<PlatformModuleFlag>();
    mocks.put.mockReturnValueOnce(put.promise);
    renderPanel();

    const sw = await screen.findByRole("switch", { name: "modules.visitors" });
    await user.click(sw);

    await waitFor(() => {
      expect(sw).toBeDisabled();
    });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw).toHaveAttribute("aria-busy", "true");
    await user.click(sw);
    expect(mocks.put).toHaveBeenCalledTimes(1);

    storedFlags = [...storedFlags, { module: "visitors", enabled: false }];
    put.resolve({ module: "visitors", enabled: false });

    await waitFor(() => {
      expect(sw).toBeEnabled();
    });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      `flagDisabled:${JSON.stringify({ module: "modules.visitors" })}`,
    );
  });

  it("reports each row's own result when two rows are toggled at once", async () => {
    const user = userEvent.setup();
    const putA = deferred<PlatformModuleFlag>();
    const putB = deferred<PlatformModuleFlag>();
    mocks.put.mockReturnValueOnce(putA.promise).mockReturnValueOnce(putB.promise);
    renderPanel();

    const a = await screen.findByRole("switch", { name: "modules.mentoring" });
    const b = flagSwitch("supervision");
    await user.click(a);
    await user.click(b);
    expect(mocks.put).toHaveBeenCalledTimes(2);

    putA.reject(
      new ApiError({ status: 409, code: "PLATFORM_TENANCY_DISABLED", message: "refused" }),
    );
    storedFlags = [...storedFlags, { module: "supervision", enabled: false }];
    putB.resolve({ module: "supervision", enabled: false });

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        `flagFailed:${JSON.stringify({ module: "modules.mentoring", reason: "PLATFORM_TENANCY_DISABLED" })}`,
      );
    });
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        `flagDisabled:${JSON.stringify({ module: "modules.supervision" })}`,
      );
    });
    await waitFor(() => {
      expect(b).toBeEnabled();
    });
    expect(a).toHaveAttribute("aria-checked", "true");
    expect(b).toHaveAttribute("aria-checked", "false");
  });
});
