import createClient, {
  type FetchResponse,
  type MaybeOptionalInit,
  type Middleware,
} from "openapi-fetch";
import type { HttpMethod, PathsWithMethod } from "openapi-typescript-helpers";

import { createBrowserRefreshCoordinator } from "./cross-tab.js";
import { ApiError, type ApiErrorDetail } from "./errors.js";
import type { paths } from "./gen/schema.js";
import { cookieTokenStore, type TokenStore } from "./token-store.js";

const MUTATING_METHODS: readonly HttpMethod[] = ["post", "put", "patch", "delete"];

const SIMULATION_TIME_HEADER = "X-Simulation-Time";

/**
 * 401 codes that say the access token is dead, not that the request was
 * wrong, so a refresh is worth one try. AUTH_SESSION_REVOKED is the common
 * one in practice: another tab's refresh rotates the session and revokes
 * the row this tab's token names. That tab announced its new token, so
 * this one takes it instead of rotating the shared cookie again; without
 * that hand-over (cross-tab.ts) the tabs would revoke each other in turn.
 * When the session was really ended, the refresh fails and onUnauthorized
 * sends the reader to sign in instead of leaving every screen on a retry
 * that cannot work.
 */
const REFRESHABLE_CODES: ReadonlySet<string> = new Set([
  "AUTH_TOKEN_EXPIRED",
  "AUTH_SESSION_REVOKED",
  "AUTH_TOKEN_INVALID",
]);

export interface CreateApiClientOptions {
  /** API origin, e.g. "https://api.sekolahku.id" or "http://localhost:8080". */
  baseUrl: string;
  /** Reads the current access token from wherever the app keeps it in memory. */
  getAccessToken: () => string | null | Promise<string | null>;
  /** Called once a 401 could not be resolved by a token refresh. */
  onUnauthorized?: () => void;
  /**
   * Called with every access token the client obtains by refreshing, so the
   * app can keep its own in-memory copy in step. Without it the app's
   * `getAccessToken` keeps returning null after a refresh and every request
   * pays for its own 401-and-retry.
   */
  onAccessToken?: (accessToken: string) => void;
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
  /**
   * Optional per-request test clock, sent as `X-Simulation-Time`. Never
   * attached to authentication requests (`/v1/auth/*`). `/v1/me` does carry
   * it: the reader's duties, and the permissions they grant, are the ones
   * active on the business day, so a simulated day must reach it too. The
   * app returns a value only once `/v1/me` has shown the actor may simulate.
   */
  getSimulationTime?: () => string | null;
  /**
   * Called when the server refuses the test clock on `/v1/me` (403
   * FORBIDDEN: the actor may no longer simulate, e.g. platform_superadmin
   * was revoked mid-session). The app must stop sending the clock here,
   * since the server refuses every request that carries it. The client
   * then sends that `/v1/me` once more without the clock, so the reader's
   * identity, and with it whether they may simulate, can still be read.
   */
  onSimulationRefused?: () => void;
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
  /**
   * Forgets every access token this client holds on its own: the one it
   * kept from its last refresh, and whatever a refresh still on its way
   * brings back. Call it whenever the app ends a session on purpose
   * (signing out, ending an impersonation), along with clearing its own
   * copy: until then a request made while the app has no token still goes
   * out with the remembered one, which can name a session that is still
   * alive on the server. A failed refresh forgets on its own. The next
   * sign-in, and every refresh after it, work as before.
   *
   * Call it as well right before the app takes a new identity's token (a
   * sign-in, the start of an impersonation, a role-testing switch): a
   * refresh started for the previous identity then neither stores nor
   * announces that identity's token over the new one, and one that fails
   * does not report the new session as unauthorized.
   */
  forgetAccessToken: () => void;
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

interface RefreshOptions {
  /** False for the page load's refresh: no session yet is not a lost one. */
  notifyOnFailure?: boolean;
  /** The access token the server just refused, or null when none was sent. */
  failedToken?: string | null;
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
  // The most recent token this client refreshed, used when the app's own
  // getAccessToken has not caught up yet. Dropped by forgetAccessToken()
  // and by a failed refresh: the session it belongs to has ended.
  let lastRefreshed: string | null = null;
  // Counts the sessions the app has ended or replaced. A refresh that
  // started before the latest one ended belongs to that session, so its
  // answer is dropped instead of handing the ended session's token back to
  // the app.
  let endedSessions = 0;

  // Web only: the tabs of one origin share the refresh cookie, so their
  // refreshes take turns and hand each other the result (cross-tab.ts).
  // Mobile has one token store per app and refreshes on its own.
  // latestSessionToken is the newest access token known for the cookie's
  // current session: this client's own last refresh, or a later one
  // another tab announced. Dropped with lastRefreshed.
  let latestSessionToken: string | null = null;
  const coordinator =
    tokenStore === cookieTokenStore
      ? createBrowserRefreshCoordinator((accessToken) => {
          // Taken only once this tab's own token stops working (see
          // tokenNewerThan), never pushed into the app right away: a tab
          // in the middle of an impersonation or a sign-in keeps its own.
          latestSessionToken = accessToken;
        })
      : null;

  function forgetAccessToken(): void {
    endedSessions += 1;
    lastRefreshed = null;
    latestSessionToken = null;
    // The next refresh starts on its own instead of joining one whose
    // answer will be dropped.
    refreshInFlight = null;
  }

  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    return coordinator ? coordinator.exclusive(task) : task();
  }

  /**
   * The token another tab announced after `failedToken` was issued, if
   * any. Called while holding the refresh lock: the tab that held it before
   * announced its token just before letting go, so one turn of the event
   * loop first gives that announcement the chance to arrive. If it is
   * still late, this tab refreshes once more in its turn, which is safe:
   * the turns keep the shared cookie from being sent twice.
   */
  async function tokenNewerThan(failedToken: string | null): Promise<string | null> {
    if (!coordinator) return null;
    await new Promise((resolve) => setTimeout(resolve, 0));
    return latestSessionToken !== null && latestSessionToken !== failedToken
      ? latestSessionToken
      : null;
  }

  async function refreshAccessToken({
    notifyOnFailure = true,
    failedToken = null,
  }: RefreshOptions = {}): Promise<string | null> {
    const flight = (refreshInFlight ??= (async () => {
      const startedIn = endedSessions;
      const sessionEnded = () => endedSessions !== startedIn;
      const data = await exclusive(async () => {
        const announced = await tokenNewerThan(failedToken);
        if (announced) return { access_token: announced };
        const refreshToken = await tokenStore.getRefreshToken();
        const response = await fetch(`${options.baseUrl}/v1/auth/refresh`, {
          method: "POST",
          credentials,
          headers: { "content-type": "application/json" },
          body: refreshToken ? JSON.stringify({ refresh_token: refreshToken }) : undefined,
        });
        if (!response.ok) return null;
        const body = (await response.json()) as { access_token: string; refresh_token?: string };
        // Announced even when this tab no longer wants it: the rotation
        // has already revoked the session the other tabs' tokens name.
        coordinator?.announce(body.access_token);
        return body;
      });
      // The app ended the session while this was on its way: nothing about
      // it is stored, and the app is not told, since it already knows.
      if (sessionEnded()) return null;
      if (!data) {
        lastRefreshed = null;
        latestSessionToken = null;
        await tokenStore.clear();
        // Checked again after the await: a session that started meanwhile
        // is not the one that failed, and must not be signed out for it.
        if (sessionEnded()) return null;
        if (notifyOnFailure) {
          options.onUnauthorized?.();
        }
        return null;
      }
      await tokenStore.setTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      if (sessionEnded()) return null;
      // Remember it here too: the web app keeps the access token in a
      // module variable this package cannot see, so a client that only
      // wrote to the token store would refresh on every single request.
      lastRefreshed = data.access_token;
      latestSessionToken = data.access_token;
      options.onAccessToken?.(data.access_token);
      return data.access_token;
    })());
    try {
      return await flight;
    } finally {
      // Only this flight's own slot: after forgetAccessToken() a newer
      // refresh may already be running in it.
      if (refreshInFlight === flight) refreshInFlight = null;
    }
  }

  // A page load starts with no access token in memory: the session lives
  // only in the refresh cookie (web) or the secure store (mobile). Without
  // this, every query on the first screen fires unauthenticated, collects a
  // 401 and retries. One boot refresh up front replaces that burst.
  // A failure here means "no session yet", not "session lost", so it must
  // not call onUnauthorized: a public page (document verification) would
  // otherwise be bounced to the login screen.
  // Held as a promise rather than a boolean so the second and third request
  // of a page load wait for the same boot refresh instead of racing past it
  // with no token and each collecting its own 401.
  let bootRefresh: Promise<unknown> | null = null;

  async function hasSomethingToRefresh(): Promise<boolean> {
    // Web keeps the refresh token in an httpOnly cookie this code cannot
    // read, so the only way to find out is to ask the server. Mobile holds
    // it in the token store, and with nothing there the call is pointless.
    if (tokenStore === cookieTokenStore) {
      return true;
    }
    return (await tokenStore.getRefreshToken()) !== null;
  }

  async function ensureBootRefresh(url: string): Promise<void> {
    if (url.includes("/v1/auth/")) {
      return;
    }
    bootRefresh ??= (async () => {
      if (!(await hasSomethingToRefresh())) {
        return;
      }
      await refreshAccessToken({ notifyOnFailure: false });
    })();
    await bootRefresh;
  }

  async function currentToken(): Promise<string | null> {
    return (await options.getAccessToken()) ?? lastRefreshed;
  }

  // A Request's body can be read exactly once -- by the time onResponse
  // sees `request`, coreFetch has already sent it and its body stream (if
  // any) is spent, so `new Request(request, ...)` for a retry throws
  // "already been used" for every mutating method. onRequest clones the
  // request (headers -- Idempotency-Key included -- and body) before it is
  // sent, while the body is still untouched, and stashes the untouched
  // clone here for onResponse to rebuild a retry from; a GET has no body,
  // so cloning it is just cheap insurance. Keyed by the original request
  // object identity, so no explicit cleanup is needed: the entry drops out
  // once that request is no longer reachable.
  const retrySeeds = new WeakMap<Request, Request>();

  /**
   * `/v1/me` is how the app learns whether the reader may simulate at all,
   * so it must not stay locked out by the clock it sends: once the actor
   * loses the right to simulate, the server answers 403 to every request
   * carrying the clock, `/v1/me` included, and the app would never see the
   * permissions that turn the clock off. Any other 403 is returned as is.
   */
  async function recoverRefusedSimulation(request: Request, response: Response) {
    if (
      new URL(request.url).pathname !== "/v1/me" ||
      !request.headers.has(SIMULATION_TIME_HEADER) ||
      (await parseErrorFromResponse(response)).code !== "FORBIDDEN"
    ) {
      return response;
    }
    options.onSimulationRefused?.();
    const seed = retrySeeds.get(request) ?? request;
    const retryHeaders = new Headers(seed.headers);
    retryHeaders.delete(SIMULATION_TIME_HEADER);
    return fetch(new Request(seed, { headers: retryHeaders }));
  }

  const middleware: Middleware = {
    async onRequest({ request }) {
      if (!(await currentToken())) {
        await ensureBootRefresh(request.url);
      }
      const token = await currentToken();
      if (token) {
        request.headers.set("Authorization", `Bearer ${token}`);
      }
      request.headers.set("Accept-Language", options.getLocale?.() ?? "id");
      request.headers.set("X-Client", options.clientHeader);
      if (options.tenantSlug) {
        request.headers.set("X-Tenant", options.tenantSlug);
      }
      const requestPath = new URL(request.url).pathname;
      if (!requestPath.startsWith("/v1/auth/")) {
        const simulationTime = options.getSimulationTime?.();
        if (simulationTime) request.headers.set(SIMULATION_TIME_HEADER, simulationTime);
      }
      const method = request.method.toLowerCase() as HttpMethod;
      if (MUTATING_METHODS.includes(method) && !request.headers.has("Idempotency-Key")) {
        request.headers.set("Idempotency-Key", randomUUID());
      }
      retrySeeds.set(request, request.clone());
      return request;
    },
    async onResponse({ request, response }) {
      if (response.status === 403) {
        return recoverRefusedSimulation(request, response);
      }
      if (response.status !== 401) {
        return response;
      }
      // Refresh when the access token can no longer be used (see
      // REFRESHABLE_CODES), or when the request went out with no token at
      // all (a fresh page load whose session lives only in the httpOnly
      // refresh cookie). Any other 401 is a real rejection: a failed sign-in
      // sent while a stale token is in memory must still come back as
      // AUTH_INVALID_CREDENTIALS, untouched.
      const { code } = await parseErrorFromResponse(response);
      const sentToken = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? null;
      const isRefreshCall = request.url.endsWith("/v1/auth/refresh");
      if (isRefreshCall || (sentToken !== null && !REFRESHABLE_CODES.has(code))) {
        return response;
      }
      // refreshAccessToken already clears the token store and calls
      // onUnauthorized on failure; nothing more to do here than give up.
      const newToken = await refreshAccessToken({ failedToken: sentToken });
      if (!newToken) {
        return response;
      }
      // Same Idempotency-Key (and same body) as the first attempt, carried
      // over from the untouched clone -- this retry must read as the exact
      // same logical request to the server, not a new one.
      const seed = retrySeeds.get(request) ?? request;
      const retryHeaders = new Headers(seed.headers);
      retryHeaders.set("Authorization", `Bearer ${newToken}`);
      return fetch(new Request(seed, { headers: retryHeaders }));
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
    forgetAccessToken,
  };
}
