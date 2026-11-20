import type { NewsekolahApiClient } from "@newsekolah/api-client";
import type * as Ui from "@newsekolah/ui";
import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken } from "../lib/api/access-token";
import type { ExpiredSession } from "../lib/api/client";

import { AppProviders } from "./providers";

function PassThrough({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

const navigation = vi.hoisted(() => ({ replace: vi.fn(), pathname: "/dashboard" }));
/** The session-expiry handler AppProviders hands the API client provider. */
const handlers = vi.hoisted(() => ({
  onUnauthorized: undefined as ((session: ExpiredSession) => void) | undefined,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => navigation.pathname,
}));

vi.mock("../lib/query/query-provider", () => ({ QueryProvider: PassThrough }));
vi.mock("../lib/api/client", () => ({
  ApiClientProvider: ({
    onUnauthorized,
    children,
  }: {
    onUnauthorized: (session: ExpiredSession) => void;
    children?: ReactNode;
  }) => {
    handlers.onUnauthorized = onUnauthorized;
    return <>{children}</>;
  },
}));
vi.mock("../lib/tenant/tenant-provider", () => ({ TenantProvider: PassThrough }));
vi.mock("../lib/session/session-provider", () => ({ SessionProvider: PassThrough }));
vi.mock("../lib/simulation/simulation-sync", () => ({ SimulationSync: () => null }));
vi.mock("../lib/session/account-boundary", () => ({ AccountBoundary: () => null }));
vi.mock("../lib/session/user-locale-sync", () => ({ UserLocaleSync: () => null }));
vi.mock("../lib/theme/theme-provider", () => ({ ThemeProvider: PassThrough }));
vi.mock("../components/ui-locale-provider", () => ({ UiLocaleProvider: PassThrough }));
vi.mock("../components/unsaved-changes-dialog", () => ({ UnsavedChangesDialog: () => null }));

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

/** Moves a minute on per test, past the previous redirect's window. */
let clock = Date.now();

beforeEach(() => {
  // Each test starts after the previous redirect's window
  // (lib/session/auth-redirect-flag.ts) has closed.
  clock += 60_000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
  vi.clearAllMocks();
  navigation.pathname = "/dashboard";
  handlers.onUnauthorized = undefined;
  setAccessToken(null);
});

afterEach(() => {
  vi.useRealTimers();
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

// A refresh failed mid-visit. The sign-in page reads the cached `me`: left
// there, it would take the tab for signed in and send it straight back.
describe("a session that runs out mid-visit", () => {
  const BRANDING_KEY = ["tenant", "branding", "default"];
  const UNREAD_KEY = ["notifications", "unread-count"];

  function expireOn(pathname: string, { signedIn = true } = {}) {
    navigation.pathname = pathname;
    render(
      <AppProviders locale="id">
        <p>Halaman</p>
      </AppProviders>,
    );
    const queryClient = new QueryClient();
    if (signedIn) queryClient.setQueryData(["me"], { id: "teacher" });
    queryClient.setQueryData(UNREAD_KEY, { count: 2 });
    queryClient.setQueryData(BRANDING_KEY, { name: "School" });
    const forgetAccessToken = vi.fn();
    const client = { forgetAccessToken } as unknown as NewsekolahApiClient;
    setAccessToken("teacher-token");
    handlers.onUnauthorized?.({ client, queryClient });
    return { queryClient, forgetAccessToken };
  }

  it("ends the session completely before going to sign in", () => {
    const { queryClient, forgetAccessToken } = expireOn("/dashboard");

    expect(queryClient.getQueryData(["me"])).toBeUndefined();
    expect(queryClient.getQueryData(UNREAD_KEY)).toBeUndefined();
    expect(queryClient.getQueryData(BRANDING_KEY)).toEqual({ name: "School" });
    expect(forgetAccessToken).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    // The tab knew who was signed in, so the sign-in page says the session ended.
    expect(navigation.replace).toHaveBeenCalledWith(
      "/login?next=%2Fdashboard&reason=session-ended",
    );
  });

  // A request that started after the first expiry (the removed `me`
  // refetching) fails too before the navigation lands. It finds no `me`,
  // but must not replace the first target and drop the notice.
  it("keeps the session-ended notice when a second request expires", () => {
    const { queryClient } = expireOn("/dashboard");
    queryClient.setQueryData(UNREAD_KEY, { count: 3 });
    const client = { forgetAccessToken: vi.fn() } as unknown as NewsekolahApiClient;
    handlers.onUnauthorized?.({ client, queryClient });

    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/login?next=%2Fdashboard&reason=session-ended",
    );
    expect(queryClient.getQueryData(UNREAD_KEY)).toBeUndefined();
  });

  // Nobody was known to be signed in (the boot refresh failed before `me`
  // loaded): the sign-in page has nothing to explain.
  it("names no reason when no signed-in reader was cached", () => {
    expireOn("/dashboard", { signedIn: false });

    expect(navigation.replace).toHaveBeenCalledWith("/login?next=%2Fdashboard");
  });

  // Public pages work without a session: a failed boot refresh there is
  // "nobody is signed in", not a session that ended.
  it("leaves a public page where it is, with what it read", () => {
    const { queryClient, forgetAccessToken } = expireOn("/verify/letter-1");

    expect(queryClient.getQueryData(["me"])).toEqual({ id: "teacher" });
    expect(queryClient.getQueryData(UNREAD_KEY)).toEqual({ count: 2 });
    expect(forgetAccessToken).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
