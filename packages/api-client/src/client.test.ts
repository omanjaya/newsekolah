import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  it("scopes simulation to business requests and reads its latest instant per request", async () => {
    const seen: [string, string | null][] = [];
    server.use(
      http.get(`${BASE_URL}/v1/me`, ({ request }) => {
        seen.push(["me", request.headers.get("x-simulation-time")]);
        return HttpResponse.json({ id: "u1" });
      }),
      http.get(`${BASE_URL}/v1/tenant/branding`, ({ request }) => {
        seen.push(["business", request.headers.get("x-simulation-time")]);
        return HttpResponse.json({ name: "School" });
      }),
      http.post(`${BASE_URL}/v1/auth/logout`, ({ request }) => {
        seen.push(["auth", request.headers.get("x-simulation-time")]);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    let current: string | null = "2026-09-30T00:00:00.000Z";
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => "token",
      clientHeader: "web/1.0.0",
      getSimulationTime: () => current,
    });
    await client.GET("/v1/me");
    await client.GET("/v1/tenant/branding");
    current = "2026-10-01T01:00:00.000Z";
    await client.GET("/v1/tenant/branding");
    await client.POST("/v1/auth/logout");
    expect(seen).toEqual([
      ["me", null],
      ["business", "2026-09-30T00:00:00.000Z"],
      ["business", "2026-10-01T01:00:00.000Z"],
      ["auth", null],
    ]);
  });
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

  it("does not attempt a refresh for a 401 that does not say the token is dead", async () => {
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

  it("reuses the same Idempotency-Key across the automatic 401-refresh retry", async () => {
    const seenKeys: (string | null)[] = [];
    server.use(
      http.post(`${BASE_URL}/v1/billing/payments`, ({ request }) => {
        seenKeys.push(request.headers.get("idempotency-key"));
        const auth = request.headers.get("authorization");
        if (auth !== "Bearer fresh-token") {
          return HttpResponse.json(errorBody("AUTH_TOKEN_EXPIRED"), { status: 401 });
        }
        return HttpResponse.json({ id: "p1" }, { status: 201 });
      }),
      http.post(`${BASE_URL}/v1/auth/refresh`, () =>
        HttpResponse.json({ access_token: "fresh-token" }),
      ),
    );

    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => "expired",
      clientHeader: "mobile/ios/1.0.0",
      tokenStore: createMemoryTokenStore("refresh-abc"),
    });

    const result = await client.POST("/v1/billing/payments", { body: {} as never });

    expect(result).toEqual({ id: "p1" });
    // One key sent with the first (401) attempt, the same key sent again
    // on the transparent retry -- a client-driven retry of the *same*
    // logical request must never mint a second key, or the server's
    // idempotency store would treat it as an unrelated request and
    // double-run the payment.
    expect(seenKeys).toHaveLength(2);
    expect(seenKeys[0]).toEqual(expect.any(String));
    expect(seenKeys[1]).toBe(seenKeys[0]);
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

// Another tab's refresh rotates the session and revokes the row this tab's
// access token names; an admin can also end a session on purpose. Either
// way the token is dead, and a retry with it can never work.
describe("a 401 for a revoked or unusable token", () => {
  it.each(["AUTH_SESSION_REVOKED", "AUTH_TOKEN_INVALID"])(
    "refreshes on %s and retries the same request with the new token",
    async (code) => {
      const seenKeys: (string | null)[] = [];
      let refreshCalls = 0;
      server.use(
        http.post(`${BASE_URL}/v1/billing/payments`, ({ request }) => {
          seenKeys.push(request.headers.get("idempotency-key"));
          if (request.headers.get("authorization") !== "Bearer rotated-token") {
            return HttpResponse.json(errorBody(code), { status: 401 });
          }
          return HttpResponse.json({ id: "a1" }, { status: 201 });
        }),
        http.post(`${BASE_URL}/v1/auth/refresh`, () => {
          refreshCalls += 1;
          return HttpResponse.json({ access_token: "rotated-token" });
        }),
      );
      const onUnauthorized = vi.fn();
      const client = createApiClient({
        baseUrl: BASE_URL,
        getAccessToken: () => "revoked-token",
        clientHeader: "web/1.0.0",
        tokenStore: createMemoryTokenStore("refresh-abc"),
        onUnauthorized,
      });

      const result = await client.POST("/v1/billing/payments", { body: {} as never });

      expect(result).toEqual({ id: "a1" });
      expect(refreshCalls).toBe(1);
      expect(seenKeys).toHaveLength(2);
      expect(seenKeys[1]).toBe(seenKeys[0]);
      expect(onUnauthorized).not.toHaveBeenCalled();
    },
  );

  it("sends the reader to sign in when the session really ended", async () => {
    const onUnauthorized = vi.fn();
    server.use(
      http.get(`${BASE_URL}/v1/me`, () =>
        HttpResponse.json(errorBody("AUTH_SESSION_REVOKED"), { status: 401 }),
      ),
      http.post(`${BASE_URL}/v1/auth/refresh`, () =>
        HttpResponse.json(errorBody("AUTH_SESSION_REVOKED"), { status: 401 }),
      ),
    );
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => "revoked-token",
      clientHeader: "web/1.0.0",
      tokenStore: createMemoryTokenStore("refresh-abc"),
      onUnauthorized,
    });

    const error = await client.GET("/v1/me").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("AUTH_SESSION_REVOKED");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("leaves a failed sign-in's AUTH_INVALID_CREDENTIALS untouched with a stale token in memory", async () => {
    let refreshCalls = 0;
    const onUnauthorized = vi.fn();
    server.use(
      http.post(`${BASE_URL}/v1/auth/login`, () =>
        HttpResponse.json(errorBody("AUTH_INVALID_CREDENTIALS"), { status: 401 }),
      ),
      http.post(`${BASE_URL}/v1/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({ access_token: "new" });
      }),
    );
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => "stale-token",
      clientHeader: "web/1.0.0",
      onUnauthorized,
    });

    const error = await client
      .POST("/v1/auth/login", {
        body: { username: "guru", password: "salah", client: "web" },
      })
      .catch((e: unknown) => e);

    expect((error as ApiError).code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(refreshCalls).toBe(0);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  // The web app treats a stop that comes back 401, or 400 NOT_IMPERSONATING,
  // as "the impersonation is already over" and ends the session
  // (apps/web/features/auth/api.ts). Both must still reach it.
  describe("stopping an impersonation", () => {
    it("still answers 401 when the impersonation session ended and cannot be refreshed", async () => {
      const onUnauthorized = vi.fn();
      server.use(
        http.post(`${BASE_URL}/v1/auth/impersonation/stop`, () =>
          HttpResponse.json(errorBody("AUTH_SESSION_REVOKED"), { status: 401 }),
        ),
        http.post(`${BASE_URL}/v1/auth/refresh`, () =>
          HttpResponse.json(errorBody("AUTH_SESSION_REVOKED"), { status: 401 }),
        ),
      );
      const client = createApiClient({
        baseUrl: BASE_URL,
        getAccessToken: () => "impersonation-token",
        clientHeader: "web/1.0.0",
        tokenStore: createMemoryTokenStore("refresh-abc"),
        onUnauthorized,
      });

      const error = await client.POST("/v1/auth/impersonation/stop").catch((e: unknown) => e);

      expect((error as ApiError).status).toBe(401);
      expect((error as ApiError).code).toBe("AUTH_SESSION_REVOKED");
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it("answers 400 NOT_IMPERSONATING when the refresh lands on another identity", async () => {
      server.use(
        http.post(`${BASE_URL}/v1/auth/impersonation/stop`, ({ request }) =>
          request.headers.get("authorization") === "Bearer own-token"
            ? HttpResponse.json(errorBody("NOT_IMPERSONATING"), { status: 400 })
            : HttpResponse.json(errorBody("AUTH_SESSION_REVOKED"), { status: 401 }),
        ),
        http.post(`${BASE_URL}/v1/auth/refresh`, () =>
          HttpResponse.json({ access_token: "own-token" }),
        ),
      );
      const client = createApiClient({
        baseUrl: BASE_URL,
        getAccessToken: () => "impersonation-token",
        clientHeader: "web/1.0.0",
        tokenStore: createMemoryTokenStore("refresh-abc"),
      });

      const error = await client.POST("/v1/auth/impersonation/stop").catch((e: unknown) => e);

      expect((error as ApiError).status).toBe(400);
      expect((error as ApiError).code).toBe("NOT_IMPERSONATING");
    });
  });
});

// The web app hands each refreshed token to its own store (onAccessToken),
// but the client also keeps the last one and sends it whenever the app has
// none. After the app ends a session on purpose, that remembered token can
// still name a live session (an admin's own, after an impersonation), so
// it must go with it.
describe("forgetting the remembered access token", () => {
  /** `/v1/me` answers whoever the bearer token names, and 401 with no token. */
  function meRecordingAuthorization(seen: (string | null)[]) {
    return http.get(`${BASE_URL}/v1/me`, ({ request }) => {
      const authorization = request.headers.get("authorization");
      seen.push(authorization);
      return authorization
        ? HttpResponse.json({ id: authorization.replace("Bearer ", "") })
        : HttpResponse.json(errorBody("AUTH_UNAUTHENTICATED"), { status: 401 });
    });
  }

  it("keeps using the boot refresh's token until the app ends the session, then sends none", async () => {
    const seen: (string | null)[] = [];
    let refreshCalls = 0;
    server.use(
      meRecordingAuthorization(seen),
      http.post(`${BASE_URL}/v1/auth/refresh`, () => {
        refreshCalls += 1;
        // The first refresh is the page load's; by the second one the
        // session has been ended on the server.
        return refreshCalls === 1
          ? HttpResponse.json({ access_token: "admin-token" })
          : HttpResponse.json(errorBody("AUTH_INVALID_CREDENTIALS"), { status: 401 });
      }),
    );
    const client = createApiClient({
      baseUrl: BASE_URL,
      // The app's own store never catches up in this test, so every
      // authorized request below rides on the remembered token.
      getAccessToken: () => null,
      clientHeader: "web/1.0.0",
    });

    expect(await client.GET("/v1/me")).toEqual({ id: "admin-token" });
    expect(await client.GET("/v1/me")).toEqual({ id: "admin-token" });
    client.forgetAccessToken();
    const error = await client.GET("/v1/me").catch((e: unknown) => e);

    expect(seen).toEqual(["Bearer admin-token", "Bearer admin-token", null]);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    // The page load's refresh, then the one the unauthenticated 401 asked for.
    expect(refreshCalls).toBe(2);
  });

  it("drops the answer of a refresh that was on its way when the session ended", async () => {
    const seen: (string | null)[] = [];
    const onAccessToken = vi.fn();
    const onUnauthorized = vi.fn();
    let refreshCalls = 0;
    let refreshStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    let answerRefresh: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      answerRefresh = resolve;
    });
    server.use(
      meRecordingAuthorization(seen),
      http.post(`${BASE_URL}/v1/auth/refresh`, async () => {
        refreshCalls += 1;
        if (refreshCalls === 1) {
          refreshStarted();
          await answered;
          return HttpResponse.json({ access_token: "ended-session-token" });
        }
        return HttpResponse.json(errorBody("AUTH_INVALID_CREDENTIALS"), { status: 401 });
      }),
    );
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => null,
      clientHeader: "web/1.0.0",
      onAccessToken,
      onUnauthorized,
    });

    const request = client.GET("/v1/me").catch((e: unknown) => e);
    await started;
    client.forgetAccessToken();
    answerRefresh();
    const error = await request;

    expect(onAccessToken).not.toHaveBeenCalled();
    expect(seen).toEqual([null]);
    expect(error).toBeInstanceOf(ApiError);
    // Only the later refresh, which the server refused, reports the
    // session as gone; the dropped one stays quiet.
    expect(refreshCalls).toBe(2);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("forgets the remembered token on its own when a refresh fails", async () => {
    const seen: (string | null)[] = [];
    let refreshCalls = 0;
    server.use(
      http.get(`${BASE_URL}/v1/me`, ({ request }) => {
        const authorization = request.headers.get("authorization");
        seen.push(authorization);
        // The remembered token has run out; the refresh below then fails.
        return authorization
          ? HttpResponse.json(errorBody("AUTH_TOKEN_EXPIRED"), { status: 401 })
          : HttpResponse.json(errorBody("AUTH_UNAUTHENTICATED"), { status: 401 });
      }),
      http.get(`${BASE_URL}/v1/tenant/branding`, () => HttpResponse.json({ name: "School" })),
      http.post(`${BASE_URL}/v1/auth/refresh`, () => {
        refreshCalls += 1;
        return refreshCalls === 1
          ? HttpResponse.json({ access_token: "earlier-token" })
          : HttpResponse.json(errorBody("AUTH_INVALID_CREDENTIALS"), { status: 401 });
      }),
    );
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => null,
      clientHeader: "web/1.0.0",
      onUnauthorized: () => undefined,
    });

    // The page load's refresh remembers "earlier-token".
    await client.GET("/v1/tenant/branding");
    await client.GET("/v1/me").catch(() => undefined);
    await client.GET("/v1/me").catch(() => undefined);

    expect(seen).toEqual(["Bearer earlier-token", null]);
  });

  it("uses a new session's token after forgetting the previous one", async () => {
    const seen: (string | null)[] = [];
    let appToken: string | null = "first-session";
    server.use(meRecordingAuthorization(seen));
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => appToken,
      clientHeader: "web/1.0.0",
    });

    await client.GET("/v1/me");
    appToken = null;
    client.forgetAccessToken();
    appToken = "second-session";
    await client.GET("/v1/me");

    expect(seen).toEqual(["Bearer first-session", "Bearer second-session"]);
  });
});

// A sign-in, the start of an impersonation or a role-testing switch hands
// the app a new identity's token while a refresh for the previous one may
// still be on its way. The app calls forgetAccessToken() right before it
// takes the new token (useStartSession, the web app's switchReader).
describe("switching identity while a refresh is on its way", () => {
  it("does not hand the previous identity's refreshed token over the new one", async () => {
    const seen: (string | null)[] = [];
    const onAccessToken = vi.fn();
    let appToken: string | null = "admin-expired";
    let refreshStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    let answerRefresh: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      answerRefresh = resolve;
    });
    server.use(
      http.get(`${BASE_URL}/v1/me`, ({ request }) => {
        const authorization = request.headers.get("authorization");
        seen.push(authorization);
        return authorization === "Bearer admin-expired"
          ? HttpResponse.json(errorBody("AUTH_TOKEN_EXPIRED"), { status: 401 })
          : HttpResponse.json({ id: authorization?.replace("Bearer ", "") });
      }),
      http.post(`${BASE_URL}/v1/auth/refresh`, async () => {
        refreshStarted();
        await answered;
        return HttpResponse.json({ access_token: "admin-refreshed" });
      }),
    );
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => appToken,
      clientHeader: "web/1.0.0",
      onAccessToken: (token) => {
        onAccessToken(token);
        appToken = token;
      },
    });

    const request = client.GET("/v1/me").catch((e: unknown) => e);
    await started;
    // The switch lands while the admin's refresh is still on its way.
    client.forgetAccessToken();
    appToken = "teacher-token";
    answerRefresh();
    const error = await request;

    expect(error).toBeInstanceOf(ApiError);
    expect(onAccessToken).not.toHaveBeenCalled();
    expect(appToken).toBe("teacher-token");
    expect(await client.GET("/v1/me")).toEqual({ id: "teacher-token" });
    expect(seen).toEqual(["Bearer admin-expired", "Bearer teacher-token"]);
  });

  // The sign-in page after a sign-out: its own `/v1/me` goes out with no
  // token, and the refresh it asks for fails on the dead cookie. A sign-in
  // that completes before that answer arrives must keep its token.
  it("does not report a session that started meanwhile as unauthorized", async () => {
    const seen: (string | null)[] = [];
    const onUnauthorized = vi.fn();
    let appToken: string | null = null;
    let refreshCalls = 0;
    let refreshStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    let answerRefresh: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      answerRefresh = resolve;
    });
    server.use(
      http.get(`${BASE_URL}/v1/me`, ({ request }) => {
        const authorization = request.headers.get("authorization");
        seen.push(authorization);
        return authorization
          ? HttpResponse.json({ id: authorization.replace("Bearer ", "") })
          : HttpResponse.json(errorBody("AUTH_UNAUTHENTICATED"), { status: 401 });
      }),
      http.post(`${BASE_URL}/v1/auth/refresh`, async () => {
        refreshCalls += 1;
        // The page load's boot refresh fails at once; the one the
        // unauthenticated 401 asks for is still on its way at the sign-in.
        if (refreshCalls > 1) {
          refreshStarted();
          await answered;
        }
        return HttpResponse.json(errorBody("AUTH_INVALID_CREDENTIALS"), { status: 401 });
      }),
    );
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => appToken,
      clientHeader: "web/1.0.0",
      // What the web app does: drop its own token, then go to sign in.
      onUnauthorized: () => {
        onUnauthorized();
        appToken = null;
      },
    });

    const request = client.GET("/v1/me").catch((e: unknown) => e);
    await started;
    // The sign-in completes.
    client.forgetAccessToken();
    appToken = "new-session";
    answerRefresh();
    const error = await request;

    expect(error).toBeInstanceOf(ApiError);
    expect(refreshCalls).toBe(2);
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(appToken).toBe("new-session");
    expect(await client.GET("/v1/me")).toEqual({ id: "new-session" });
    expect(seen).toEqual([null, "Bearer new-session"]);
  });
});

// Every browser tab keeps its own access token but sends the same refresh
// cookie, and each refresh rotates it, revoking the session the other tabs'
// tokens name. Without coordination two tabs revoke each other in turn, and
// two refreshes sent with the same cookie read as refresh-token reuse,
// which revokes the whole session family (cross-tab.ts).
describe("several tabs sharing one refresh cookie", () => {
  const openChannels: BroadcastChannel[] = [];

  /** Web Locks as one browser provides them: one holder at a time, in order. */
  function createLockManager() {
    let tail: Promise<unknown> = Promise.resolve();
    return {
      request(name: string, callback: (lock: { name: string }) => unknown) {
        const run = tail.then(() => callback({ name }));
        tail = run.catch(() => undefined);
        return run;
      },
    };
  }

  beforeEach(() => {
    vi.stubGlobal("navigator", { locks: createLockManager() });
    vi.stubGlobal(
      "BroadcastChannel",
      class extends BroadcastChannel {
        constructor(name: string) {
          super(name);
          openChannels.push(this);
        }
      },
    );
  });
  afterEach(() => {
    for (const channel of openChannels.splice(0)) channel.close();
    vi.unstubAllGlobals();
  });

  function revokedUnlessRotated() {
    return http.get(`${BASE_URL}/v1/me`, ({ request }) =>
      request.headers.get("authorization") === "Bearer rotated-token"
        ? HttpResponse.json({ id: "u1" })
        : HttpResponse.json(errorBody("AUTH_SESSION_REVOKED"), { status: 401 }),
    );
  }

  function createTab(staleToken: string) {
    const tab = { token: staleToken, onAccessToken: vi.fn(), onUnauthorized: vi.fn() };
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => tab.token,
      clientHeader: "web/1.0.0",
      onAccessToken: (token) => {
        tab.onAccessToken(token);
        tab.token = token;
      },
      onUnauthorized: tab.onUnauthorized,
    });
    return { tab, client };
  }

  it("refreshes once for two tabs whose sessions were revoked together", async () => {
    let refreshCalls = 0;
    server.use(
      revokedUnlessRotated(),
      http.post(`${BASE_URL}/v1/auth/refresh`, async () => {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return HttpResponse.json({ access_token: "rotated-token" });
      }),
    );
    const first = createTab("first-tab-token");
    const second = createTab("second-tab-token");

    const results = await Promise.all([first.client.GET("/v1/me"), second.client.GET("/v1/me")]);

    expect(results).toEqual([{ id: "u1" }, { id: "u1" }]);
    expect(refreshCalls).toBe(1);
    expect(first.tab.token).toBe("rotated-token");
    expect(second.tab.token).toBe("rotated-token");
    expect(first.tab.onUnauthorized).not.toHaveBeenCalled();
    expect(second.tab.onUnauthorized).not.toHaveBeenCalled();
  });

  it("takes the token another tab announced instead of rotating the cookie again", async () => {
    let refreshCalls = 0;
    server.use(
      revokedUnlessRotated(),
      http.post(`${BASE_URL}/v1/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({ access_token: "rotated-token" });
      }),
    );
    const first = createTab("first-tab-token");
    const second = createTab("second-tab-token");

    expect(await first.client.GET("/v1/me")).toEqual({ id: "u1" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // The announcement waits until the second tab's own token stops
    // working: a tab in the middle of an impersonation keeps its own.
    expect(second.tab.onAccessToken).not.toHaveBeenCalled();
    expect(await second.client.GET("/v1/me")).toEqual({ id: "u1" });

    expect(refreshCalls).toBe(1);
    expect(second.tab.onAccessToken).toHaveBeenCalledWith("rotated-token");
  });

  it("refreshes on its own once the app ended the session it was announced for", async () => {
    let refreshCalls = 0;
    server.use(
      revokedUnlessRotated(),
      http.post(`${BASE_URL}/v1/auth/refresh`, () => {
        refreshCalls += 1;
        return HttpResponse.json({ access_token: "rotated-token" });
      }),
    );
    const first = createTab("first-tab-token");
    const second = createTab("second-tab-token");

    await first.client.GET("/v1/me");
    await new Promise((resolve) => setTimeout(resolve, 10));
    second.client.forgetAccessToken();
    await second.client.GET("/v1/me");

    expect(refreshCalls).toBe(2);
  });
});
