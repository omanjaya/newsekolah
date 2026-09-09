import { configureApiAuth, request } from "@/lib/api";

jest.mock("expo-crypto", () => ({ randomUUID: () => "test-idempotency-key" }));

const BASE_URL = "https://api.test";

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("api client refresh single-flight", () => {
  let accessToken = "expired-token";
  let refreshCallCount = 0;

  beforeEach(() => {
    accessToken = "expired-token";
    refreshCallCount = 0;

    configureApiAuth({
      getBaseUrl: () => BASE_URL,
      getAccessToken: () => accessToken,
      getRefreshToken: () => "refresh-token",
      getTenantSlug: () => "demo",
      onTokensRefreshed: (tokens) => {
        accessToken = tokens.access_token;
      },
      onRefreshFailed: () => undefined,
    });
  });

  it("issues exactly one refresh call for two concurrent 401s, then retries both", async () => {
    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes("/v1/auth/refresh")) {
        refreshCallCount += 1;
        return Promise.resolve(
          jsonResponse(200, {
            token_type: "Bearer",
            access_token: "fresh-token",
            access_expires_at: "2030-01-01T00:00:00Z",
            user: { id: "u1" },
          }),
        );
      }

      if (accessToken === "expired-token") {
        return Promise.resolve(
          jsonResponse(401, { error: { code: "AUTH_TOKEN_EXPIRED", message: "expired" } }),
        );
      }

      return Promise.resolve(jsonResponse(200, { ok: true, url }));
    }) as unknown as typeof fetch;

    const [first, second] = await Promise.all([
      request<{ ok: boolean }>("/v1/one"),
      request<{ ok: boolean }>("/v1/two"),
    ]);

    expect(refreshCallCount).toBe(1);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(accessToken).toBe("fresh-token");
  });

  it("throws ApiError with the server's stable code on a non-recoverable error", async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve(
        jsonResponse(422, { error: { code: "VALIDATION_FAILED", message: "Invalid payload" } }),
      ),
    );

    await expect(request("/v1/anything")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      status: 422,
    });
  });

  it("attaches an Idempotency-Key header on mutating requests", async () => {
    const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit | undefined]>(() =>
      Promise.resolve(jsonResponse(204, undefined)),
    );
    globalThis.fetch = fetchMock;

    await request("/v1/mutate", { method: "POST", body: { a: 1 } });

    const call = fetchMock.mock.calls[0];
    const headers = call?.[1]?.headers as Record<string, string> | undefined;
    expect(headers?.["Idempotency-Key"]).toBe("test-idempotency-key");
    expect(headers?.["X-Tenant"]).toBe("demo");
  });
});
