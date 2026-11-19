import { ApiError, queryKeys } from "@newsekolah/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TenantBrand } from "../../components/tenant-brand";

import { resolveTenantAccents } from "./accent";
import { readBrandingSessionCopy } from "./branding-session-copy";
import {
  BRANDING_MAX_RETRIES,
  brandingRetryDelay,
  TenantProvider,
  useTenant,
  type TenantBranding,
} from "./tenant-provider";

const get = vi.fn();

vi.mock("../api/client", () => ({ useApiClient: () => ({ GET: get }) }));

const STORAGE_KEY = "newsekolah.tenant-branding";

function Name() {
  const { displayName, isLoading } = useTenant();
  return <span data-testid="name">{isLoading ? "unknown" : displayName}</span>;
}

function renderProvider(
  initialBranding?: Partial<TenantBranding>,
  seed?: (queryClient: QueryClient) => void,
) {
  // The app's own default: no retry for a 4xx (lib/query/query-provider.tsx).
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(queryClient);
  return render(
    <QueryClientProvider client={queryClient}>
      <TenantProvider initialBranding={initialBranding as TenantBranding | undefined}>
        <Name />
        <TenantBrand />
      </TenantProvider>
    </QueryClientProvider>,
  );
}

function rateLimited() {
  return new ApiError({ status: 429, code: "RATE_LIMITED", message: "too many requests" });
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  get.mockReset();
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe("TenantProvider", () => {
  it("makes no browser request when the server already supplied the branding", () => {
    renderProvider({ name: "SMA Harapan" });
    expect(screen.getByTestId("name")).toHaveTextContent("SMA Harapan");
    expect(get).not.toHaveBeenCalled();
  });

  // The phone header cut a long school name at about 17 characters while
  // the school's own short name sat unused in its branding.
  it("exposes the school's short name, and none when it is blank", () => {
    function ShortName() {
      const { shortName } = useTenant();
      return <span data-testid="short">{shortName ?? "none"}</span>;
    }
    function renderWith(branding: Partial<TenantBranding>) {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return render(
        <QueryClientProvider client={queryClient}>
          <TenantProvider initialBranding={branding as TenantBranding}>
            <ShortName />
          </TenantProvider>
        </QueryClientProvider>,
      );
    }
    renderWith({ name: "SMA Negeri 1 Kuta Selatan", short_name: " SMAN 1 Kuta " });
    expect(screen.getByTestId("short").textContent).toBe("SMAN 1 Kuta");
    cleanup();
    renderWith({ name: "SMA Harapan", short_name: "  " });
    expect(screen.getByTestId("short")).toHaveTextContent("none");
  });

  // Buttons hovered and pressed in the platform green under a navy accent
  // (audit r3-n42): the strong shade follows the school's colour too.
  it("writes the hover and press shade of the school's accent for both themes", () => {
    renderProvider({ name: "SMA Harapan", accent_color: "#1F3A5F" });
    const accents = resolveTenantAccents("#1F3A5F");
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--tenant-accent-strong")).toBe(accents.lightStrong);
    expect(style.getPropertyValue("--tenant-accent-dark-strong")).toBe(accents.darkStrong);
  });

  it("fetches the branding when the server could not supply it", () => {
    get.mockResolvedValue({ name: "SMA Harapan" });
    renderProvider();
    expect(get).toHaveBeenCalledWith("/v1/tenant/branding");
  });

  it("keeps a copy of the branding for this tab once known", async () => {
    get.mockResolvedValue({ name: "SMA Harapan", accent_color: "#0F7A5F" });
    renderProvider();
    expect(
      await screen.findByText("SMA Harapan", { selector: "[data-testid=name]" }),
    ).toBeVisible();
    expect(readBrandingSessionCopy()).toMatchObject({ name: "SMA Harapan" });
  });

  it("never shows the product name while a refused fetch is retried with nothing known", async () => {
    vi.useFakeTimers();
    get.mockRejectedValue(rateLimited());
    renderProvider();

    // Every retry, then the final failure.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(get).toHaveBeenCalledTimes(BRANDING_MAX_RETRIES + 1);
    expect(screen.getByTestId("name")).toHaveTextContent("unknown");
    expect(screen.queryByText("SION")).not.toBeInTheDocument();
    expect(screen.queryByText("SI")).not.toBeInTheDocument();
  });

  // The header kept a skeleton for good while every branding request was
  // refused, though the signed-in session named the school (audit r3-n14).
  it("names the signed-in school once the fetch is refused with nothing known", async () => {
    get.mockRejectedValue(rateLimited());
    renderProvider(undefined, (queryClient) => {
      queryClient.setQueryData(queryKeys.me(), {
        tenant: { name: "SMA Contoh", accent_color: "#1F3A5F" },
      });
    });

    expect(await screen.findByText("SMA Contoh", { selector: "[data-testid=name]" })).toBeVisible();
    // The mark falls back to the school's initials beside it, not a skeleton.
    expect(screen.getByText("SC")).toBeInTheDocument();
    expect(screen.queryByText("SION")).not.toBeInTheDocument();
    // The session's tenant is the school's whole branding: the accent follows.
    const accents = resolveTenantAccents("#1F3A5F");
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--tenant-accent")).toBe(accents.light);
    expect(style.getPropertyValue("--tenant-accent-strong")).toBe(accents.lightStrong);
  });

  it("shows the signed-in school's logo and switched-off modules while the fetch is refused", async () => {
    function Library() {
      const { branding } = useTenant();
      return <span data-testid="off">{branding?.disabled_public_modules.join(",") ?? "none"}</span>;
    }
    get.mockRejectedValue(rateLimited());
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.me(), {
      tenant: {
        name: "SMA Contoh",
        logo_url: "https://example.test/logo.png",
        disabled_public_modules: ["library"],
      },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TenantProvider>
          <Library />
          <TenantBrand />
        </TenantProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("library", { selector: "[data-testid=off]" })).toBeVisible();
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.test/logo.png");
  });

  it("waits for the branding before naming the school from the session", () => {
    get.mockReturnValue(new Promise(() => undefined));
    renderProvider(undefined, (queryClient) => {
      queryClient.setQueryData(queryKeys.me(), { tenant: { name: "SMA Contoh" } });
    });
    expect(screen.getByTestId("name")).toHaveTextContent("unknown");
  });

  it("keeps naming the school from this tab's copy when the fetch is refused", async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name: "SMA Harapan" }));
    get.mockRejectedValue(rateLimited());
    renderProvider();

    expect(screen.getByTestId("name")).toHaveTextContent("SMA Harapan");
    expect(await screen.findAllByText("SMA Harapan")).toHaveLength(2);
    expect(screen.queryByText("SION")).not.toBeInTheDocument();
  });

  it("ignores a stored copy that is not branding", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{not json");
    expect(readBrandingSessionCopy()).toBeUndefined();
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name: "" }));
    expect(readBrandingSessionCopy()).toBeUndefined();
  });

  it("backs off between retries, up to 30 seconds", () => {
    expect(brandingRetryDelay(0)).toBe(1000);
    expect(brandingRetryDelay(2)).toBe(4000);
    expect(brandingRetryDelay(10)).toBe(30_000);
  });
});
