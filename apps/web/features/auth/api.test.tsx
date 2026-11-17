import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken } from "../../lib/api/access-token";
import { CLEAR_ACCESS_COOKIE_PATH } from "../../lib/session/clear-server-access-cookie";
import type { Me } from "../../lib/session/session-provider";
import {
  clearSimulation,
  getSimulationTime,
  setSimulation,
  syncSimulationIdentity,
} from "../../lib/simulation/clock";

import {
  useGoogleLoginMutation,
  useLogoutMutation,
  usePasskeyLoginMutation,
  useStopImpersonationMutation,
} from "./api";

const post = vi.hoisted(() => vi.fn());
const forgetAccessToken = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/client", () => ({
  useApiClient: () => ({ POST: post, forgetAccessToken }),
}));
vi.mock("../../lib/webauthn", () => ({
  getPasskey: () => Promise.resolve({ id: "credential" }),
}));

function person(id: string, permissions: string[] = []): Me {
  return {
    id,
    name: id,
    username: id,
    permissions,
    roles: [],
    tenant: { tenant_id: "school", timezone: "Asia/Makassar", locale: "id", name: "School" },
    must_change_password: false,
  } as unknown as Me;
}

const BRANDING_KEY = ["tenant", "branding", "default"];
const UNREAD_KEY = ["notifications", "unread-count"];

/** Requests in the order they went out: API paths, and "clear-sat" for the cookie route. */
let calls: string[] = [];
let clearSatStatus = 204;

/** A tab that still holds what an earlier account read, and the school's branding. */
function setup<T>(useHook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], person("earlier"));
  client.setQueryData(UNREAD_KEY, { count: 3 });
  client.setQueryData(BRANDING_KEY, { name: "School" });
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(useHook, { wrapper });
  return { client, result };
}

/** A superadmin with a frozen test clock, so a test can tell whether the clock was cleared. */
function startTestClock(): string {
  syncSimulationIdentity(person("earlier", ["platform_superadmin"]));
  setSimulation("frozen", new Date("2026-09-30T00:00:00Z"));
  return "2026-09-30T00:00:00.000Z";
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  clearSimulation();
  syncSimulationIdentity(undefined);
  setAccessToken("earlier-token");
  calls = [];
  clearSatStatus = 204;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      calls.push(url === CLEAR_ACCESS_COOKIE_PATH ? "clear-sat" : url);
      return Promise.resolve(new Response(null, { status: clearSatStatus }));
    }),
  );
  post.mockImplementation((path: string) => {
    calls.push(path);
    return Promise.resolve(undefined);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useStopImpersonationMutation", () => {
  it("ends the session once the server stopped it, the client's remembered token included", async () => {
    const frozen = startTestClock();
    const { client, result } = setup(() => useStopImpersonationMutation());
    expect(getSimulationTime()).toBe(frozen);

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(calls).toEqual(["/v1/auth/impersonation/stop", "clear-sat"]);
    expect(getAccessToken()).toBeNull();
    // The client's own copy may be the admin's token, still valid: left
    // there, the sign-in page would read the tab as the admin, signed in.
    expect(forgetAccessToken).toHaveBeenCalledTimes(1);
    expect(getSimulationTime()).toBeNull();
    expect(client.getQueryData(UNREAD_KEY)).toBeUndefined();
    expect(client.getQueryData(["me"])).toBeUndefined();
    expect(client.getQueryData(BRANDING_KEY)).toEqual({ name: "School" });
  });

  // The impersonation session is still alive on the server and the browser
  // still holds its refresh cookie: the tab really is still impersonating,
  // and the strip that says so must not lose what it reads.
  it("changes nothing when the stop fails", async () => {
    const frozen = startTestClock();
    post.mockRejectedValue(new Error("offline"));
    const { client, result } = setup(() => useStopImpersonationMutation());

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow("offline");
    });

    expect(getAccessToken()).toBe("earlier-token");
    expect(forgetAccessToken).not.toHaveBeenCalled();
    expect(getSimulationTime()).toBe(frozen);
    expect(calls).not.toContain("clear-sat");
    expect(client.getQueryData<Me>(["me"])?.id).toBe("earlier");
    expect(client.getQueryData(UNREAD_KEY)).toEqual({ count: 3 });
  });

  it("still signs out when the server stopped it but the cookie route refused", async () => {
    clearSatStatus = 403;
    const { client, result } = setup(() => useStopImpersonationMutation());

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(getAccessToken()).toBeNull();
    expect(forgetAccessToken).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["me"])).toBeUndefined();
  });
});

describe("useLogoutMutation", () => {
  it("drops every copy of the token and the account's data once the server signed out", async () => {
    const { client, result } = setup(() => useLogoutMutation());

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(calls).toEqual(["/v1/auth/logout"]);
    expect(getAccessToken()).toBeNull();
    expect(forgetAccessToken).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["me"])).toBeUndefined();
    expect(client.getQueryData(BRANDING_KEY)).toEqual({ name: "School" });
  });

  it("drops the tokens even when the request fails, and keeps what was read", async () => {
    post.mockRejectedValue(new Error("offline"));
    const { client, result } = setup(() => useLogoutMutation());

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow("offline");
    });

    expect(getAccessToken()).toBeNull();
    expect(forgetAccessToken).toHaveBeenCalledTimes(1);
    expect(client.getQueryData<Me>(["me"])?.id).toBe("earlier");
  });
});

// The tab may still hold another account's reads (a session that ran out,
// a logout whose request failed). A password sign-in drops them (useLogin);
// Google and passkey sign-ins must too, since nothing reads them again.
describe("Google and passkey sign-in", () => {
  const next = person("next");

  it("starts a Google sign-in from an empty cache, with me from the response", async () => {
    post.mockResolvedValue({ access_token: "next-token", user: next });
    const { client, result } = setup(() => useGoogleLoginMutation());

    await act(async () => {
      await result.current.mutateAsync("google-id-token");
    });

    expect(post).toHaveBeenCalledWith("/v1/auth/sso/google", {
      body: { id_token: "google-id-token", client: "web" },
    });
    expect(getAccessToken()).toBe("next-token");
    expect(client.getQueryData(["notifications", "unread-count"])).toBeUndefined();
    expect(client.getQueryData<Me>(["me"])?.id).toBe("next");
  });

  it("starts a passkey sign-in from an empty cache, with me from the response", async () => {
    post.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/v1/auth/passkeys/login/options"
          ? { ceremony_id: "ceremony", public_key: {} }
          : { access_token: "next-token", user: next },
      ),
    );
    const { client, result } = setup(() => usePasskeyLoginMutation());

    await act(async () => {
      await result.current.mutateAsync("next");
    });

    expect(post).toHaveBeenLastCalledWith("/v1/auth/passkeys/login", {
      body: { ceremony_id: "ceremony", credential: { id: "credential" }, client: "web" },
    });
    expect(getAccessToken()).toBe("next-token");
    expect(client.getQueryData(["notifications", "unread-count"])).toBeUndefined();
    expect(client.getQueryData<Me>(["me"])?.id).toBe("next");
  });
});
