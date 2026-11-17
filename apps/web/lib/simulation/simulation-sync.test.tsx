import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "../session/session-provider";

import { clearSimulation, setSimulation, syncSimulationIdentity } from "./clock";
import { SimulationSync } from "./simulation-sync";

const session = vi.hoisted(() => ({ me: undefined as Me | undefined, isReady: false }));

vi.mock("../session/session-provider", () => ({
  useSession: () => ({
    me: session.me,
    isReady: session.isReady,
    status: session.me ? "authenticated" : "loading",
  }),
}));

function user(superadmin: boolean): Me {
  return {
    id: superadmin ? "admin" : "teacher",
    name: "Pengguna",
    username: "pengguna",
    roles: [],
    permissions: superadmin ? ["platform_superadmin"] : [],
    tenant: { tenant_id: "school", timezone: "Asia/Makassar", name: "School", locale: "id" },
    must_change_password: false,
  } as unknown as Me;
}

function renderSync(client: QueryClient): { rerender: () => void } {
  const tree = (): ReactElement => (
    <QueryClientProvider client={client}>
      <SimulationSync />
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    rerender: () => {
      view.rerender(tree());
    },
  };
}

describe("SimulationSync", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearSimulation();
    syncSimulationIdentity(undefined);
    session.me = undefined;
    session.isReady = false;
  });

  it("keeps the page's queries when the reader is identified and no simulation applies", async () => {
    const client = new QueryClient();
    client.setQueryData(["tenant", "branding", "default"], { name: "SMA Contoh" });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const view = renderSync(client);

    session.me = user(false);
    session.isReady = true;
    await act(async () => {
      view.rerender();
      await Promise.resolve();
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(client.getQueryState(["tenant", "branding", "default"])?.isInvalidated).toBe(false);
  });

  it("refetches the page's queries once the business clock moves", async () => {
    const client = new QueryClient();
    client.setQueryData(["attendance", "today"], { sessions: [] });
    client.setQueryData(["me"], user(true));
    const view = renderSync(client);
    session.me = user(true);
    session.isReady = true;
    await act(async () => {
      view.rerender();
      await Promise.resolve();
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await act(async () => {
      setSimulation("frozen", new Date("2026-09-28T00:00:00Z"));
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(invalidate).toHaveBeenCalledTimes(1);
    });
    expect(client.getQueryState(["attendance", "today"])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["me"])?.isInvalidated).toBe(false);
  });
});
