import createClient, {
  type FetchResponse,
  type MaybeOptionalInit,
  type Middleware,
} from "openapi-fetch";
import type { HttpMethod, PathsWithMethod } from "openapi-typescript-helpers";

import { ApiError, type ApiErrorDetail } from "./errors.js";
import type { paths } from "./gen/schema.js";
import { cookieTokenStore, type TokenStore } from "./token-store.js";

const MUTATING_METHODS: readonly HttpMethod[] = ["post", "put", "patch", "delete"];

export interface CreateApiClientOptions {
  /** API origin, e.g. "https://api.sekolahku.id" or "http://localhost:8080". */
  baseUrl: string;
  /** Reads the current access token from wherever the app keeps it in memory. */
  getAccessToken: () => string | null | Promise<string | null>;
  /** Called once a 401 could not be resolved by a token refresh. */
  onUnauthorized?: () => void;
  /** Sent as `X-Tenant` for mobile clients before a session exists; ignored once the host resolves a tenant. */
  tenantSlug?: string;
  /** `"include"` for web (cookie-based refresh), `"omit"` for mobile. Defaults to `"same-origin"`. */
  credentials?: RequestCredentials;
  /** Reads and writes the refresh token; web uses the default cookie-only store. */
  tokenStore?: TokenStore;
  /** e.g. "web/1.4.0" or "mobile/ios/1.4.0". */
  clientHeader: string;
  /** Returns a BCP 47 locale for `Accept-Language`. Defaults to "id". */
  getLocale?: () => string;
}

/**
 * Each method's call signature mirrors openapi-fetch's own `ClientMethod`,
 * except it resolves to the response body directly and throws `ApiError`
 * instead of returning `{ data, error }`. `Method` is written as a literal
 * on each signature (not threaded through a shared `<Method>` type alias):
 * openapi-fetch's own `ClientMethod<Paths, Method, Media>` is generic over
 * `Method` too, but it ships pre-compiled, so consuming it never re-runs
 * TypeScript's constraint check on `FetchResponse<Paths[Path][Method], ...>`
 * the way declaring an equivalent alias in this file would. Unlike the
 * upstream type, the init argument is always optional at the type level
 * even when the operation requires params or a body; passing a bad or
 * missing one is still caught by `Init`'s own shape, just one argument
 * later than upstream.
 */
export interface NewsekolahApiClient {
  GET: <
    Path extends PathsWithMethod<paths, "get">,
    Init extends MaybeOptionalInit<paths[Path], "get">,
  >(
    url: Path,
    init?: Init & Record<string, unknown>,
  ) => Promise<NonNullable<FetchResponse<paths[Path]["get"], Init, "application/json">["data"]>>;
  POST: <
    Path extends PathsWithMethod<paths, "post">,
    Init extends MaybeOptionalInit<paths[Path], "post">,
  >(
    url: Path,
    init?: Init & Record<string, unknown>,
  ) => Promise<NonNullable<FetchResponse<paths[Path]["post"], Init, "application/json">["data"]>>;
  PUT: <
    Path extends PathsWithMethod<paths, "put">,
    Init extends MaybeOptionalInit<paths[Path], "put">,
  >(
    url: Path,
    init?: Init & Record<string, unknown>,
  ) => Promise<NonNullable<FetchResponse<paths[Path]["put"], Init, "application/json">["data"]>>;
  PATCH: <
    Path extends PathsWithMethod<paths, "patch">,
    Init extends MaybeOptionalInit<paths[Path], "patch">,
  >(
    url: Path,
    init?: Init & Record<string, unknown>,
  ) => Promise<NonNullable<FetchResponse<paths[Path]["patch"], Init, "application/json">["data"]>>;
  DELETE: <
    Path extends PathsWithMethod<paths, "delete">,
    Init extends MaybeOptionalInit<paths[Path], "delete">,
  >(
    url: Path,
    init?: Init & Record<string, unknown>,
  ) => Promise<NonNullable<FetchResponse<paths[Path]["delete"], Init, "application/json">["data"]>>;
}

function randomUUID(): string {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for runtimes without Web Crypto's randomUUID (older RN/Hermes).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

interface ParsedError {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  requestId?: string;
}

/** Reads the Error envelope out of an already-parsed JSON body (openapi-fetch's `error`). */
function parseErrorFromBody(body: unknown, fallbackMessage: string): ParsedError {
  const error = (body as { error?: Record<string, unknown> } | undefined)?.error;
  if (error && typeof error.code === "string" && typeof error.message === "string") {
    return {
      code: error.code,
      message: error.message,
      details: Array.isArray(error.details) ? (error.details as ApiErrorDetail[]) : undefined,
      requestId: typeof error.request_id === "string" ? error.request_id : undefined,
    };
  }
  return { code: "UNKNOWN", message: fallbackMessage };
}

/**
 * Reads the Error envelope directly off a `Response`. Only safe to call on a
 * response whose body has not been consumed yet (e.g. inside `onResponse`,
 * before openapi-fetch parses it): `unwrap` below uses the body openapi-fetch
 * already parsed instead of re-reading the stream a second time.
 */
async function parseErrorFromResponse(response: Response): Promise<ParsedError> {
  try {
    const body: unknown = await response.clone().json();
    return parseErrorFromBody(body, response.statusText || "Request failed");
  } catch {
    // response body was not JSON (proxy error page, empty body, etc.)
    return { code: "UNKNOWN", message: response.statusText || "Request failed" };
  }
}

/**
 * Wraps the generated openapi-fetch client with the cross-cutting behavior
 * every request needs: auth headers, tenant scoping, idempotency, a single
 * transparent refresh-and-retry on an expired access token, and throwing
 * `ApiError` instead of returning `{ data, error }` for every other failure.
 */
export function createApiClient(options: CreateApiClientOptions): NewsekolahApiClient {
  const tokenStore = options.tokenStore ?? cookieTokenStore;
  const credentials = options.credentials ?? "same-origin";
  const raw = createClient<paths>({ baseUrl: options.baseUrl, credentials });

  // Single-flight: concurrent 401s share one refresh call instead of each
  // firing its own /v1/auth/refresh request.
  let refreshInFlight: Promise<string | null> | null = null;

  async function refreshAccessToken(): Promise<string | null> {
    refreshInFlight ??= (async () => {
      const refreshToken = await tokenStore.getRefreshToken();
      const response = await fetch(`${options.baseUrl}/v1/auth/refresh`, {
        method: "POST",
        credentials,
        headers: { "content-type": "application/json" },
        body: refreshToken ? JSON.stringify({ refresh_token: refreshToken }) : undefined,
      });
      if (!response.ok) {
        await tokenStore.clear();
        options.onUnauthorized?.();
        return null;
      }
      const data = (await response.json()) as { access_token: string; refresh_token?: string };
      await tokenStore.setTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      return data.access_token;
    })();
    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  }

  const middleware: Middleware = {
    async onRequest({ request }) {
      const token = await options.getAccessToken();
      if (token) {
        request.headers.set("Authorization", `Bearer ${token}`);
      }
      request.headers.set("Accept-Language", options.getLocale?.() ?? "id");
      request.headers.set("X-Client", options.clientHeader);
      if (options.tenantSlug) {
        request.headers.set("X-Tenant", options.tenantSlug);
      }
      const method = request.method.toLowerCase() as HttpMethod;
      if (MUTATING_METHODS.includes(method) && !request.headers.has("Idempotency-Key")) {
        request.headers.set("Idempotency-Key", randomUUID());
      }
      return request;
    },
    async onResponse({ request, response }) {
      if (response.status !== 401) {
        return response;
      }
      // Refresh when the access token expired, or when the request went out
      // with no token at all (a fresh page load whose session lives only in
      // the httpOnly refresh cookie). Any other 401 is a real rejection.
      const { code } = await parseErrorFromResponse(response);
      const hadToken = request.headers.has("Authorization");
      const isRefreshCall = request.url.endsWith("/v1/auth/refresh");
      if (isRefreshCall || (hadToken && code !== "AUTH_TOKEN_EXPIRED")) {
        return response;
      }
      // refreshAccessToken already clears the token store and calls
      // onUnauthorized on failure; nothing more to do here than give up.
      const newToken = await refreshAccessToken();
      if (!newToken) {
        return response;
      }
      const retryHeaders = new Headers(request.headers);
      retryHeaders.set("Authorization", `Bearer ${newToken}`);
      return fetch(new Request(request, { headers: retryHeaders }));
    },
  };
  raw.use(middleware);

  async function unwrap<T>(
    call: Promise<{ data?: T; error?: unknown; response: Response }>,
  ): Promise<T> {
    const { data, error, response } = await call;
    if (error !== undefined) {
      throw new ApiError({
        status: response.status,
        ...parseErrorFromBody(error, response.statusText || "Request failed"),
      });
    }
    if (!response.ok) {
      throw new ApiError({
        status: response.status,
        code: "UNKNOWN",
        message: response.statusText || "Request failed",
      });
    }
    return data as T;
  }

  // `raw.<METHOD>` requires `init` to be present whenever the operation has
  // required params/body (a tuple-spread type most callers never see
  // directly); `NewsekolahApiClient` above deliberately keeps `init`
  // optional at the type level for every operation (see its doc comment),
  // so forwarding it here needs one cast bridging that intentional gap.
  return {
    GET: (url, init) => unwrap(raw.GET(url, init as never)),
    POST: (url, init) => unwrap(raw.POST(url, init as never)),
    PUT: (url, init) => unwrap(raw.PUT(url, init as never)),
    PATCH: (url, init) => unwrap(raw.PATCH(url, init as never)),
    DELETE: (url, init) => unwrap(raw.DELETE(url, init as never)),
  };
}
