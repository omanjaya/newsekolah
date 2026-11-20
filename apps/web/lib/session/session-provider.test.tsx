import { queryKeys } from "@newsekolah/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionProvider, useSession } from "./session-provider";

const navigation = vi.hoisted(() => ({ pathname: "/verify/ZLYER5" }));
const api = vi.hoisted(() => ({ GET: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("../api/client", () => ({ useApiClient: () => api }));

function Status(): ReactElement {
  const { status, isReady } = useSession();
  return <p>{`${status} ${isReady ? "ready" : "waiting"}`}</p>;
}

function renderAt(pathname: string, sessionCookieSeen: boolean, queryClient = new QueryClient()) {
  navigation.pathname = pathname;
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider sessionCookieSeen={sessionCookieSeen}>
        <Status />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  api.GET.mockReset();
});

describe("SessionProvider", () => {
  it("reads no session on an anonymous visit to a public page", async () => {
    renderAt("/verify/ZLYER5", false);

    // Anonymous at once: the header offers "Masuk" without waiting.
    expect(screen.getByText("anonymous ready")).toBeInTheDocument();
    await Promise.resolve();
    expect(api.GET).not.toHaveBeenCalled();
  });

  it.each(["/opac", "/opac/title-1", "/offline"])(
    "reads no session on %s without a refresh cookie",
    (pathname) => {
      renderAt(pathname, false);

      expect(screen.getByText("anonymous ready")).toBeInTheDocument();
      expect(api.GET).not.toHaveBeenCalled();
    },
  );

  it("reads the session on a public page when the browser holds a refresh cookie", async () => {
    api.GET.mockResolvedValue({ id: "u1", permissions: [] });
    renderAt("/verify/ZLYER5", true);

    expect(await screen.findByText("authenticated ready")).toBeInTheDocument();
    expect(api.GET).toHaveBeenCalledWith("/v1/me");
  });

  it.each(["/login", "/dashboard"])(
    "still reads the session on %s, which needs it either way",
    async (pathname) => {
      api.GET.mockRejectedValue(new Error("401"));
      renderAt(pathname, false);

      await waitFor(() => {
        expect(api.GET).toHaveBeenCalledWith("/v1/me");
      });
    },
  );

  it("keeps a session a sign-in seeded on a public page", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.me(), { id: "u1", permissions: [] });
    renderAt("/opac", false, queryClient);

    expect(screen.getByText("authenticated ready")).toBeInTheDocument();
    expect(api.GET).not.toHaveBeenCalled();
  });
});
