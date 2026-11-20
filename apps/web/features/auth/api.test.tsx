import { ApiError } from "@newsekolah/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken } from "../../lib/api/access-token";
import { STALE_ACCESS_COOKIE_NAME } from "../../lib/session/access-cookie";
import {
  CLEAR_ACCESS_COOKIE_PATH,
  CLEAR_ACCESS_COOKIE_TIMEOUT_MS,
} from "../../lib/session/clear-server-access-cookie";
import type { Me } from "../../lib/session/session-provider";
import {
  clearSimulation,
  getSimulationTime,
  setSimulation,
  syncSimulationIdentity,
} from "../../lib/simulation/clock";

import {
  useGoogleLoginMutation,
  useLoginMutation,
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

/** Whether the browser marked the server access cookie stale (lib/session/access-cookie.ts). */
function staleMarkerSet(): boolean {
  return document.cookie.split("; ").includes(`${STALE_ACCESS_COOKIE_NAME}=1`);
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
  document.cookie = `${STALE_ACCESS_COOKIE_NAME}=; Max-Age=0; Path=/`;
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useStopImpersonationMutation", () => {
  // An impersonation started from this browser parked the admin's login on
  // the server: the stop answers with the admin's own tokens, and the tab
  // becomes the admin again instead of being signed out.
  it("hands the tab back to the admin when the server restored the admin's session", async () => {
    const admin = person("admin");
    post.mockImplementation((path: string) => {
      calls.push(path);
      return Promise.resolve({ access_token: "admin-token", user: admin });
    });
    const { client, result } = setup(() => useStopImpersonationMutation());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync();
    });

    expect(outcome).toBe("restored");
    expect(calls).toEqual(["/v1/auth/impersonation/stop", "clear-sat"]);
    expect(getAccessToken()).toBe("admin-token");
    expect(client.getQueryData(["me"])).toEqual(admin);
    // The impersonated account's reads go; the school's branding stays.
    expect(client.getQueryData(UNREAD_KEY)).toBeUndefined();
    expect(client.getQueryData(BRANDING_KEY)).toEqual({ name: "School" });
  });

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

  // Nothing is left to stop: the impersonation reached its fixed end or
  // another tab stopped it (401), or this tab now holds a session that is
  // not an impersonation (400). Keeping the strip would leave a Stop that
  // can never succeed. The API client refreshes on AUTH_SESSION_REVOKED
  // first (packages/api-client client.test.ts covers both outcomes): a 401
  // still arrives here when that refresh failed, and a 400 when it landed
  // on another identity.
  it.each([
    { status: 401, code: "AUTH_SESSION_REVOKED" },
    { status: 400, code: "NOT_IMPERSONATING" },
  ])(
    "ends the session as a confirmed stop does when the server answers $status $code",
    async ({ status, code }) => {
      const frozen = startTestClock();
      post.mockImplementation((path: string) => {
        calls.push(path);
        return Promise.reject(new ApiError({ status, code, message: code }));
      });
      const { client, result } = setup(() => useStopImpersonationMutation());
      expect(getSimulationTime()).toBe(frozen);

      await act(async () => {
        await result.current.mutateAsync();
      });

      expect(calls).toEqual(["/v1/auth/impersonation/stop", "clear-sat"]);
      expect(getAccessToken()).toBeNull();
      expect(forgetAccessToken).toHaveBeenCalledTimes(1);
      expect(getSimulationTime()).toBeNull();
      expect(client.getQueryData(UNREAD_KEY)).toBeUndefined();
      expect(client.getQueryData(["me"])).toBeUndefined();
      expect(client.getQueryData(BRANDING_KEY)).toEqual({ name: "School" });
    },
  );

  // These say nothing about the session, which is still alive.
  it.each([
    { status: 503, code: "SERVICE_UNAVAILABLE" },
    { status: 429, code: "RATE_LIMITED" },
  ])("changes nothing when the server answers $status $code", async ({ status, code }) => {
    post.mockRejectedValue(new ApiError({ status, code, message: code }));
    const { client, result } = setup(() => useStopImpersonationMutation());

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toBeInstanceOf(ApiError);
    });

    expect(getAccessToken()).toBe("earlier-token");
    expect(forgetAccessToken).not.toHaveBeenCalled();
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

interface SignIn {
  name: string;
  /** The request that creates the session. */
  sessionPath: string;
  useSignIn: () => () => Promise<unknown>;
}

const signIns: SignIn[] = [
  {
    name: "password",
    sessionPath: "/v1/auth/login",
    useSignIn: () => {
      const mutation = useLoginMutation();
      return () => mutation.mutateAsync({ username: "next", password: "secret", client: "web" });
    },
  },
  {
    name: "Google",
    sessionPath: "/v1/auth/sso/google",
    useSignIn: () => {
      const mutation = useGoogleLoginMutation();
      return () => mutation.mutateAsync("google-id-token");
    },
  },
  {
    name: "passkey",
    sessionPath: "/v1/auth/passkeys/login",
    useSignIn: () => {
      const mutation = usePasskeyLoginMutation();
      return () => mutation.mutateAsync("next");
    },
  },
];

// The tab may still hold another account's reads (a session that ran out,
// a logout whose request failed), and `sat` may still name that account:
// the first server render after the sign-in would hydrate its `/v1/me`.
describe("every sign-in", () => {
  const next = person("next");

  beforeEach(() => {
    post.mockImplementation((path: string) => {
      calls.push(path);
      return Promise.resolve(
        path === "/v1/auth/passkeys/login/options"
          ? { ceremony_id: "ceremony", public_key: {} }
          : { access_token: "next-token", user: next },
      );
    });
  });

  it.each(signIns)(
    "$name: removes the server access cookie, then starts from an empty cache with me from the response",
    async ({ sessionPath, useSignIn }) => {
      // Which token the tab held when the client was told to drop any
      // refresh still on its way for the earlier account.
      let tokenWhenForgotten: string | null = "not called";
      forgetAccessToken.mockImplementation(() => {
        tokenWhenForgotten = getAccessToken();
      });
      const { client, result } = setup(() => useSignIn());

      await act(async () => {
        await result.current();
      });

      expect(calls.slice(-2)).toEqual(["clear-sat", sessionPath]);
      expect(staleMarkerSet()).toBe(false);
      expect(forgetAccessToken).toHaveBeenCalledTimes(1);
      expect(tokenWhenForgotten).toBe("earlier-token");
      expect(getAccessToken()).toBe("next-token");
      expect(client.getQueryData(UNREAD_KEY)).toBeUndefined();
      expect(client.getQueryData<Me>(["me"])?.id).toBe("next");
      expect(client.getQueryData(BRANDING_KEY)).toEqual({ name: "School" });
    },
  );

  // A proxy setting, a failing or a slow route must never lock anyone out.
  // The cookie is marked stale instead, which the server render and
  // middleware honour.
  it.each(signIns)(
    "$name: signs in all the same when the cookie route refuses, marking the cookie stale",
    async ({ sessionPath, useSignIn }) => {
      clearSatStatus = 403;
      const { client, result } = setup(() => useSignIn());

      await act(async () => {
        await result.current();
      });

      expect(calls.slice(-2)).toEqual(["clear-sat", sessionPath]);
      expect(staleMarkerSet()).toBe(true);
      expect(getAccessToken()).toBe("next-token");
      expect(client.getQueryData<Me>(["me"])?.id).toBe("next");
    },
  );

  it("signs in once the cookie route has not answered in time, marking the cookie stale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push(url === CLEAR_ACCESS_COOKIE_PATH ? "clear-sat" : url);
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }),
    );
    const { client, result } = setup(() => useLoginMutation());
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    await act(async () => {
      const signIn = result.current.mutateAsync({
        username: "next",
        password: "secret",
        client: "web",
      });
      await vi.advanceTimersByTimeAsync(CLEAR_ACCESS_COOKIE_TIMEOUT_MS);
      await signIn;
    });

    expect(calls).toEqual(["clear-sat", "/v1/auth/login"]);
    expect(staleMarkerSet()).toBe(true);
    expect(getAccessToken()).toBe("next-token");
    expect(client.getQueryData<Me>(["me"])?.id).toBe("next");
  });

  it("asks for the passkey before removing the cookie, so the prompt follows the press", async () => {
    const { result } = setup(() => usePasskeyLoginMutation());

    await act(async () => {
      await result.current.mutateAsync("next");
    });

    expect(calls).toEqual([
      "/v1/auth/passkeys/login/options",
      "clear-sat",
      "/v1/auth/passkeys/login",
    ]);
  });
});
