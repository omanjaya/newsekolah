// Temporary: replace with @newsekolah/api-client once published in the workspace.
//
// Minimal typed fetch client for the newsekolah API (openapi/openapi.yaml).
// Auth state is not imported directly to avoid a circular dependency with
// src/lib/auth: the session store registers itself via configureApiAuth().

import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import {
  ApiError,
  isApiErrorBody,
  type AuthTokens,
  type ClientKind,
  type LoginRequest,
  type Me,
  type Session,
  type TenantBranding,
  type TenantSummary,
} from "@/lib/api-types";

const APP_VERSION = "0.1.0";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface AuthHooks {
  getBaseUrl: () => string;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  getTenantSlug: () => string | null;
  onTokensRefreshed: (tokens: AuthTokens) => Promise<void> | void;
  onRefreshFailed: () => Promise<void> | void;
}

const noopHooks: AuthHooks = {
  getBaseUrl: () => "",
  getAccessToken: () => null,
  getRefreshToken: () => null,
  getTenantSlug: () => null,
  onTokensRefreshed: () => undefined,
  onRefreshFailed: () => undefined,
};

let hooks: AuthHooks = noopHooks;

/** Called once by the auth session store so the client can read/write tokens
 * without both modules importing each other. */
export function configureApiAuth(nextHooks: AuthHooks): void {
  hooks = nextHooks;
}

// Single-flight guard: concurrent 401s trigger exactly one refresh call, and
// every waiting request retries against the token that call produced.
let refreshInFlight: Promise<AuthTokens> | null = null;

async function refreshTokens(): Promise<AuthTokens> {
  refreshInFlight ??= (async () => {
    try {
      const tokens = await request<AuthTokens>("/v1/auth/refresh", {
        method: "POST",
        body: { refresh_token: hooks.getRefreshToken() },
        skipAuthRetry: true,
      });
      await hooks.onTokensRefreshed(tokens);
      return tokens;
    } catch (error) {
      await hooks.onRefreshFailed();
      throw error;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
  idempotencyKey?: string;
  /** Internal: prevents the refresh call itself from recursing into a refresh. */
  skipAuthRetry?: boolean;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | undefined>,
): string {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function parseErrorBody(response: Response): Promise<ApiError> {
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  if (isApiErrorBody(parsed)) {
    return new ApiError(response.status, parsed);
  }
  return new ApiError(response.status, {
    error: {
      code: "UNKNOWN_ERROR",
      message: `Request failed with status ${String(response.status)}`,
    },
  });
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const baseUrl = hooks.getBaseUrl();
  const url = buildUrl(baseUrl, path, options.query);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Client": `mobile/${Platform.OS}/${APP_VERSION}`,
  };

  const accessToken = hooks.getAccessToken();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const tenantSlug = hooks.getTenantSlug();
  if (tenantSlug) headers["X-Tenant"] = tenantSlug;

  if (MUTATING_METHODS.has(method)) {
    headers["Idempotency-Key"] = options.idempotencyKey ?? Crypto.randomUUID();
  }

  let requestBody: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(options.body);
  }

  const response = await fetch(url, { method, headers, body: requestBody });

  if (response.status === 204) {
    return undefined as T;
  }

  if (response.ok) {
    return (await response.json()) as T;
  }

  const error = await parseErrorBody(response);

  const canRetry =
    !options.skipAuthRetry && response.status === 401 && error.code === "AUTH_TOKEN_EXPIRED";
  if (canRetry) {
    await refreshTokens();
    return request<T>(path, { ...options, skipAuthRetry: true });
  }

  throw error;
}

// --- Endpoint helpers (kept thin; business logic lives in features/*) ---

// X-Tenant is attached by the request() header logic via hooks.getTenantSlug();
// the school-picker flow persists the chosen slug before calling login().
export function login(body: LoginRequest): Promise<AuthTokens> {
  return request<AuthTokens>("/v1/auth/login", { method: "POST", body });
}

export async function logout(): Promise<void> {
  await request("/v1/auth/logout", { method: "POST" });
}

export function listSessions(): Promise<{ data: Session[] }> {
  return request<{ data: Session[] }>("/v1/auth/sessions");
}

export async function revokeSession(sessionId: string): Promise<void> {
  await request(`/v1/auth/sessions/${sessionId}`, { method: "DELETE" });
}

export function getMe(): Promise<Me> {
  return request<Me>("/v1/me");
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request("/v1/me/password", {
    method: "PUT",
    body: { current_password: currentPassword, new_password: newPassword },
  });
}

export function lookupTenants(query: string): Promise<{ data: TenantSummary[] }> {
  return request<{ data: TenantSummary[] }>("/v1/tenants/lookup", { query: { q: query } });
}

export function getTenantBranding(): Promise<TenantBranding> {
  return request<TenantBranding>("/v1/tenant/branding");
}

export type { AuthTokens, ClientKind };
export { ApiError };
