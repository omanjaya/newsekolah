import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiClient } from "./client.js";
import { ApiError } from "./errors.js";
import { type TokenStore } from "./token-store.js";

const BASE_URL = "https://api.test.local";

function errorBody(code: string, message = "error") {
  return { error: { code, message } };
}

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

function createMemoryTokenStore(initialRefreshToken: string | null): TokenStore & {
  accessTokenHistory: string[];
} {
  let refreshToken = initialRefreshToken;
  const accessTokenHistory: string[] = [];
  return {
    accessTokenHistory,
    getRefreshToken: () => refreshToken,
    setTokens: ({ accessToken, refreshToken: nextRefresh }) => {
      accessTokenHistory.push(accessToken);
      if (nextRefresh) refreshToken = nextRefresh;
    },
    clear: () => {
      refreshToken = null;
    },
  };
}

describe("createApiClient", () => {
  it("attaches Authorization, Accept-Language, X-Client, and X-Tenant headers", async () => {
    let seenHeaders: Headers | undefined;
    server.use(
      http.get(`${BASE_URL}/v1/me`, ({ request }) => {
        seenHeaders = request.headers;
        return HttpResponse.json({ id: "u1" });
      }),
    );

    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => "access-123",
      clientHeader: "web/1.0.0",
      tenantSlug: "sman1",
      getLocale: () => "id",
    });

    await client.GET("/v1/me");

    expect(seenHeaders?.get("authorization")).toBe("Bearer access-123");
    expect(seenHeaders?.get("accept-language")).toBe("id");
    expect(seenHeaders?.get("x-client")).toBe("web/1.0.0");
    expect(seenHeaders?.get("x-tenant")).toBe("sman1");
  });

  it("adds a unique Idempotency-Key to mutating requests only", async () => {
    const seenKeys: (string | null)[] = [];
    server.use(
      http.get(`${BASE_URL}/v1/me`, ({ request }) => {
        seenKeys.push(request.headers.get("idempotency-key"));
        return HttpResponse.json({ id: "u1" });
      }),
      http.post(`${BASE_URL}/v1/auth/logout`, ({ request }) => {
        seenKeys.push(request.headers.get("idempotency-key"));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => "t",
      clientHeader: "web/1.0.0",
    });

    await client.GET("/v1/me");
    await client.POST("/v1/auth/logout");

    expect(seenKeys[0]).toBeNull();
    expect(seenKeys[1]).toEqual(expect.any(String));
  });

  it("throws ApiError with status, code, message, details, and requestId for a non-401 failure", async () => {
    server.use(
      http.get(`${BASE_URL}/v1/me`, () =>
        HttpResponse.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Data tidak ditemukan",
              details: [{ field: "id", code: "missing" }],
              request_id: "req-1",
            },
          },
          { status: 404 },
        ),
      ),
    );

    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => "t",
      clientHeader: "web/1.0.0",
    });

    const error = await client.GET("/v1/me").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(404);
    expect(apiError.code).toBe("NOT_FOUND");
    expect(apiError.message).toBe("Data tidak ditemukan");
    expect(apiError.details).toEqual([{ field: "id", code: "missing" }]);
    expect(apiError.requestId).toBe("req-1");
  });

  it("does not attempt a refresh for a 401 that is not AUTH_TOKEN_EXPIRED", async () => {
    let refreshCalls = 0;
    server.use(
      http.get(`${BASE_URL}/v1/me`, () =>
        HttpResponse.json(errorBody("AUTH_INVALID_CREDENTIALS"), { status: 401 }),
      ),
      http.post(`${BASE_URL}/v1/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({ access_token: "new" });
      }),
    );

    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => "expired",
      clientHeader: "web/1.0.0",
    });

    const error = await client.GET("/v1/me").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(refreshCalls).toBe(0);
  });

  it("refreshes once and retries transparently on AUTH_TOKEN_EXPIRED, then returns fresh data", async () => {
    let refreshCalls = 0;
    let accessToken = "expired";
    server.use(
      http.get(`${BASE_URL}/v1/me`, ({ request }) => {
        const auth = request.headers.get("authorization");
        if (auth !== "Bearer fresh-token") {
          return HttpResponse.json(errorBody("AUTH_TOKEN_EXPIRED"), { status: 401 });
        }
        return HttpResponse.json({ id: "u1" });
      }),
      http.post(`${BASE_URL}/v1/auth/refresh`, () => {
        refreshCalls += 1;
        accessToken = "fresh-token";
        return HttpResponse.json({ access_token: accessToken });
      }),
    );

    const tokenStore = createMemoryTokenStore("refresh-abc");
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => "expired",
      clientHeader: "web/1.0.0",
      tokenStore,
    });

    const result = await client.GET("/v1/me");
    expect(result).toEqual({ id: "u1" });
    expect(refreshCalls).toBe(1);
    expect(tokenStore.accessTokenHistory).toEqual(["fresh-token"]);
  });

  it("single-flights concurrent refreshes: two 401s trigger only one /v1/auth/refresh call", async () => {
    let refreshCalls = 0;
    server.use(
      http.get(`${BASE_URL}/v1/me`, ({ request }) => {
        const auth = request.headers.get("authorization");
        if (auth !== "Bearer fresh-token") {
          return HttpResponse.json(errorBody("AUTH_TOKEN_EXPIRED"), { status: 401 });
        }
        return HttpResponse.json({ id: "u1" });
      }),
      http.post(`${BASE_URL}/v1/auth/refresh`, async () => {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return HttpResponse.json({ access_token: "fresh-token" });
      }),
    );

    const tokenStore = createMemoryTokenStore("refresh-abc");
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => "expired",
      clientHeader: "web/1.0.0",
      tokenStore,
    });

    const [first, second] = await Promise.all([client.GET("/v1/me"), client.GET("/v1/me")]);

    expect(first).toEqual({ id: "u1" });
    expect(second).toEqual({ id: "u1" });
    expect(refreshCalls).toBe(1);
  });

  it("clears the token store and calls onUnauthorized when refresh itself fails", async () => {
    const onUnauthorized = vi.fn();
    server.use(
      http.get(`${BASE_URL}/v1/me`, () =>
        HttpResponse.json(errorBody("AUTH_TOKEN_EXPIRED"), { status: 401 }),
      ),
      http.post(`${BASE_URL}/v1/auth/refresh`, () =>
        HttpResponse.json(errorBody("AUTH_INVALID_CREDENTIALS"), { status: 401 }),
      ),
    );

    const tokenStore = createMemoryTokenStore("refresh-abc");
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => "expired",
      clientHeader: "web/1.0.0",
      tokenStore,
      onUnauthorized,
    });

    const error = await client.GET("/v1/me").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
