import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken } from "../../lib/api/access-token";
import type { Me } from "../../lib/session/session-provider";

import {
  useGoogleLoginMutation,
  usePasskeyLoginMutation,
  useStopImpersonationMutation,
} from "./api";

const post = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/client", () => ({ useApiClient: () => ({ POST: post }) }));
vi.mock("../../lib/webauthn", () => ({
  getPasskey: () => Promise.resolve({ id: "credential" }),
}));

function person(id: string): Me {
  return {
    id,
    name: id,
    username: id,
    permissions: [],
    roles: [],
    tenant: { tenant_id: "school", timezone: "Asia/Makassar", locale: "id", name: "School" },
    must_change_password: false,
  } as unknown as Me;
}

/** A tab that still holds what an earlier account read. */
function setup<T>(useHook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], person("earlier"));
  client.setQueryData(["notifications", "unread-count"], { count: 3 });
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(useHook, { wrapper });
  return { client, result };
}

beforeEach(() => {
  vi.clearAllMocks();
  setAccessToken("earlier-token");
});

describe("useStopImpersonationMutation", () => {
  it("ends like a logout: no token and none of the impersonated account's data", async () => {
    // A `me` left behind reads as still signed in on the sign-in screen,
    // which would send the admin straight back to the dashboard.
    post.mockResolvedValue(undefined);
    const { client, result } = setup(() => useStopImpersonationMutation());

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(post).toHaveBeenCalledWith("/v1/auth/impersonation/stop");
    expect(getAccessToken()).toBeNull();
    expect(client.getQueryData(["notifications", "unread-count"])).toBeUndefined();
    expect(client.getQueryData(["me"])).toBeUndefined();
  });

  it("clears the session even when the stop request fails", async () => {
    post.mockRejectedValue(new Error("offline"));
    const { client, result } = setup(() => useStopImpersonationMutation());

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow("offline");
    });

    expect(getAccessToken()).toBeNull();
    expect(client.getQueryData(["notifications", "unread-count"])).toBeUndefined();
    expect(client.getQueryData(["me"])).toBeUndefined();
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
