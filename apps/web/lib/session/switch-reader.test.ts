import { createApiClient, queryKeys } from "@newsekolah/api-client";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken } from "../api/access-token";
import {
  clearSimulation,
  getSimulationTime,
  setSimulation,
  syncSimulationIdentity,
} from "../simulation/clock";

import type { Me } from "./session-provider";
import { switchReader } from "./switch-reader";

function person(id: string, permissions: string[] = [], impersonatedBy?: string): Me {
  return {
    id,
    name: id,
    username: id,
    permissions,
    roles: [],
    tenant: { tenant_id: "school", timezone: "Asia/Makassar", locale: "id", name: "School" },
    must_change_password: false,
    ...(impersonatedBy
      ? { impersonated_by: { user_id: impersonatedBy, name: impersonatedBy } }
      : {}),
  } as unknown as Me;
}

const FROZEN = "2026-11-23T01:37:00.000Z";

/** Every `/v1/me` request the app's client sent, with its simulation header. */
let meRequests: (string | null)[] = [];

beforeEach(() => {
  sessionStorage.clear();
  clearSimulation();
  meRequests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: Request) => {
      if (new URL(input.url).pathname === "/v1/me") {
        meRequests.push(input.headers.get("X-Simulation-Time"));
      }
      return Promise.resolve(
        new Response(JSON.stringify(person("teacher", [], "admin")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSimulation();
  syncSimulationIdentity(undefined);
  setAccessToken(null);
});

// The server reads the reader's duties (and the permissions they grant) on
// the business day, so the `/v1/me` read that follows an impersonation must
// carry the admin's test clock like every other request, or the
// impersonated teacher's duties follow the real day instead.
describe("switchReader", () => {
  it("reads the impersonated account's /v1/me on the admin's simulated clock", async () => {
    syncSimulationIdentity(person("admin", ["platform_superadmin"]));
    setSimulation("frozen", new Date(FROZEN));
    setAccessToken("admin-token");
    const client = createApiClient({
      baseUrl: "http://api.test",
      clientHeader: "web/test",
      getAccessToken,
      getSimulationTime,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await switchReader(queryClient, client, {
      access_token: "teacher-token",
      user: person("teacher", [], "admin"),
    } as Parameters<typeof switchReader>[2]);
    await queryClient.query({
      queryKey: queryKeys.me(),
      queryFn: () => client.GET("/v1/me"),
    });

    expect(getAccessToken()).toBe("teacher-token");
    expect(meRequests).toEqual([FROZEN]);
  });

  it("sends no clock on /v1/me for an account that may not simulate", async () => {
    syncSimulationIdentity(person("teacher"));
    setAccessToken("teacher-token");
    const client = createApiClient({
      baseUrl: "http://api.test",
      clientHeader: "web/test",
      getAccessToken,
      getSimulationTime,
    });

    await client.GET("/v1/me");

    expect(meRequests).toEqual([null]);
  });
});
