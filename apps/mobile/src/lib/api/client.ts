// Builds and caches the shared @newsekolah/api-client instance. Kept out of
// src/lib/auth/ so the client and the token store it reads from do not
// import each other: AuthProvider is the only thing that imports both.
import { Platform } from "react-native";
import Constants from "expo-constants";
import { createApiClient, type NewsekolahApiClient } from "@newsekolah/api-client";
import { getBaseUrl, getTenantSlug } from "@/lib/tenant/tenant-store";
import { getAccessTokenSync, secureTokenStore } from "@/lib/auth/token-store";
import { getLocale } from "@/i18n/t";

const APP_VERSION = Constants.expoConfig?.version ?? "0.1.0";
const CLIENT_HEADER = `mobile/${Platform.OS}/${APP_VERSION}`;

let onUnauthorized: () => void = () => undefined;

/** AuthProvider registers its "drop back to signed-out" handler once at boot. */
export function setOnUnauthorized(handler: () => void): void {
  onUnauthorized = handler;
}

let cached: NewsekolahApiClient | null = null;
let cachedBaseUrl: string | null = null;
let cachedTenantSlug: string | null = null;

/**
 * @newsekolah/api-client bakes `baseUrl` and `tenantSlug` into the client at
 * construction time (see `CreateApiClientOptions`), but mobile can change
 * both before a session exists: the "Ganti alamat server" screen overrides
 * `baseUrl` and the school picker sets `tenantSlug`. This rebuilds the
 * client whenever either value has changed instead of holding one instance
 * for the app's whole lifetime. Worth reporting upstream -- the package
 * could accept getters for `baseUrl`/`tenantSlug` the way it already does
 * for `getAccessToken`, which would make this wrapper unnecessary.
 */
export function getApiClient(): NewsekolahApiClient {
  const baseUrl = getBaseUrl();
  const tenantSlug = getTenantSlug();
  if (cached && cachedBaseUrl === baseUrl && cachedTenantSlug === tenantSlug) {
    return cached;
  }
  cached = createApiClient({
    baseUrl,
    tenantSlug: tenantSlug ?? undefined,
    credentials: "omit",
    clientHeader: CLIENT_HEADER,
    getAccessToken: getAccessTokenSync,
    getLocale,
    tokenStore: secureTokenStore,
    onUnauthorized: () => {
      onUnauthorized();
    },
  });
  cachedBaseUrl = baseUrl;
  cachedTenantSlug = tenantSlug;
  return cached;
}

/**
 * Escape hatch for the offline mutation queue (src/lib/offline/queue.ts):
 * queued mutations carry a method/path pair loaded back out of SQLite at
 * flush time, which cannot satisfy `NewsekolahApiClient`'s literal-path
 * generics. This calls through the same cached client -- same headers, same
 * single-flight refresh-on-401 -- without static path checking.
 */
export function rawMutate<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body: unknown,
  idempotencyKey: string,
): Promise<T> {
  const client = getApiClient();
  const init = { body, headers: { "Idempotency-Key": idempotencyKey } };
  switch (method) {
    case "POST":
      return client.POST(path as never, init as never);
    case "PUT":
      return client.PUT(path as never, init as never);
    case "PATCH":
      return client.PATCH(path as never, init as never);
    case "DELETE":
      return client.DELETE(path as never, init as never);
  }
}
