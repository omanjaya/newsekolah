import type * as Ui from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "./providers";

function PassThrough({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/dashboard",
}));

vi.mock("../lib/query/query-provider", () => ({ QueryProvider: PassThrough }));
vi.mock("../lib/api/client", () => ({ ApiClientProvider: PassThrough }));
vi.mock("../lib/tenant/tenant-provider", () => ({ TenantProvider: PassThrough }));
vi.mock("../lib/session/session-provider", () => ({ SessionProvider: PassThrough }));
vi.mock("../lib/simulation/simulation-sync", () => ({ SimulationSync: () => null }));
vi.mock("../lib/session/account-boundary", () => ({ AccountBoundary: () => null }));
vi.mock("../lib/theme/theme-provider", () => ({ ThemeProvider: PassThrough }));
vi.mock("../components/ui-locale-provider", () => ({ UiLocaleProvider: PassThrough }));

vi.mock("@newsekolah/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof Ui>();
  return {
    ...actual,
    Toaster: () => null,
    TooltipProvider: ({
      delayDuration,
      children,
    }: {
      delayDuration?: number;
      children?: ReactNode;
    }) => (
      <div data-testid="tooltip-provider" data-delay={delayDuration}>
        {children}
      </div>
    ),
  };
});

describe("AppProviders", () => {
  // Every IconButton brings its own tooltip provider unless one is above
  // it; one at the root lets a page's buttons share it (and its skip delay).
  it("puts the whole app under one tooltip provider", () => {
    render(
      <AppProviders locale="id">
        <p>Halaman</p>
      </AppProviders>,
    );
    const providers = screen.getAllByTestId("tooltip-provider");
    expect(providers).toHaveLength(1);
    expect(providers[0]).toContainElement(screen.getByText("Halaman"));
    expect(providers[0]).toHaveAttribute("data-delay", "400");
  });
});
