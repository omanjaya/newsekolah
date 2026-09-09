// @newsekolah/api-client's own suite (packages/api-client/src/client.test.ts)
// already covers the single-flight refresh/retry behavior against msw; this
// file only tests the mobile-specific wiring in src/lib/api/client.ts and
// src/lib/auth/token-store.ts: the X-Client header, the SecureStore-backed
// TokenStore doing refresh-by-body, and rebuilding the client when the
// tenant/server the user picked changes before a session exists.
import * as SecureStore from "expo-secure-store";
import { getApiClient } from "@/lib/api/client";
import { loadTenantConfig, setBaseUrlOverride, setTenantSlug } from "@/lib/tenant/tenant-store";
import { loadStoredTokens } from "@/lib/auth/token-store";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

function headersFrom(input: RequestInfo | URL, init?: RequestInit): Headers {
  if (input instanceof Request) return input.headers;
  return new Headers(init?.headers);
}

async function bodyFrom(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const raw = input instanceof Request ? await input.clone().text() : (init?.body as string);
  return raw ? (JSON.parse(raw) as unknown) : undefined;
}

// openapi-fetch reads `globalThis.fetch` once, at client construction (see
// its `fetch: baseFetch = globalThis.fetch` default parameter) -- it is not
// re-read per request. getApiClient() only rebuilds when baseUrl/tenantSlug
// change (see lib/api/client.ts), so reusing "demo" across tests would reuse
// one test's client, bound to that test's now-stale fetch mock, in the next.
// Giving every test its own tenant slug keeps them isolated.
let testTenantCounter = 0;

describe("mobile api client wiring", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    testTenantCounter += 1;
    await loadTenantConfig();
    await setBaseUrlOverride("https://api.test");
    await setTenantSlug(`demo-${String(testTenantCounter)}`);
    await loadStoredTokens();
  });

  it("sends X-Client for this platform and X-Tenant for the chosen school", async () => {
    let seenHeaders: Headers | undefined;
    globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      seenHeaders = headersFrom(input, init);
      return Promise.resolve(new Response(JSON.stringify({ id: "u1" }), { status: 200 }));
    });

    await getApiClient().GET("/v1/me");

    expect(seenHeaders?.get("x-client")).toMatch(/^mobile\/(ios|android)\//);
    expect(seenHeaders?.get("x-tenant")).toBe(`demo-${String(testTenantCounter)}`);
  });

  it("rebuilds the client when the chosen school or server address changes", async () => {
    const first = getApiClient();
    expect(getApiClient()).toBe(first); // stable when nothing changed

    await setTenantSlug("other-school");
    const afterTenantChange = getApiClient();
    expect(afterTenantChange).not.toBe(first);

    await setBaseUrlOverride("https://self-hosted.example");
    const afterServerChange = getApiClient();
    expect(afterServerChange).not.toBe(afterTenantChange);
  });

  it("refreshes by body through the SecureStore-backed token store, single-flighting two concurrent 401s", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === "newsekolah.refresh_token" ? "refresh-abc" : null),
    );
    await loadStoredTokens();

    let refreshCalls = 0;
    let currentAccessToken = "expired-token";

    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      const headers = headersFrom(input, init);

      if (url.includes("/v1/auth/refresh")) {
        refreshCalls += 1;
        const body = await bodyFrom(input, init);
        expect(body).toEqual({ refresh_token: "refresh-abc" });
        currentAccessToken = "fresh-token";
        return new Response(JSON.stringify({ access_token: currentAccessToken }), {
          status: 200,
        });
      }

      if (headers.get("authorization") !== `Bearer ${currentAccessToken}`) {
        return new Response(
          JSON.stringify({ error: { code: "AUTH_TOKEN_EXPIRED", message: "expired" } }),
          { status: 401 },
        );
      }
      return new Response(JSON.stringify({ id: "u1" }), { status: 200 });
    });

    const client = getApiClient();
    const [first, second] = await Promise.all([client.GET("/v1/me"), client.GET("/v1/me")]);

    expect(first).toEqual({ id: "u1" });
    expect(second).toEqual({ id: "u1" });
    expect(refreshCalls).toBe(1);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("newsekolah.access_token", "fresh-token");
  });

  it("attaches a unique Idempotency-Key on mutating requests only", async () => {
    const seenKeys: (string | null)[] = [];
    globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      seenKeys.push(headersFrom(input, init).get("idempotency-key"));
      return Promise.resolve(new Response(JSON.stringify({ id: "u1" }), { status: 200 }));
    });

    const client = getApiClient();
    await client.GET("/v1/me");
    await client.POST("/v1/auth/logout");

    expect(seenKeys[0]).toBeNull();
    expect(seenKeys[1]).toEqual(expect.any(String));
  });
});
