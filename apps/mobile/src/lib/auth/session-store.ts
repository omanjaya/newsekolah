// Temporary: replace with @newsekolah/api-client once published in the workspace.
//
// Tokens live in SecureStore (encrypted, per-app keychain/keystore entry) with
// an in-memory mirror so the api client's header logic can read them
// synchronously. `me` itself is never persisted here: AuthProvider keeps it
// in memory only and re-fetches GET /v1/me on cold start.

import * as SecureStore from "expo-secure-store";
import { configureApiAuth, type AuthTokens } from "@/lib/api";
import { getBaseUrl, getTenantSlug } from "@/lib/tenant/tenant-store";

const ACCESS_TOKEN_KEY = "newsekolah.access_token";
const REFRESH_TOKEN_KEY = "newsekolah.refresh_token";

let accessToken: string | null = null;
let refreshToken: string | null = null;

export interface StoredTokens {
  accessToken: string | null;
  refreshToken: string | null;
}

export async function loadStoredTokens(): Promise<StoredTokens> {
  const [storedAccess, storedRefresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  accessToken = storedAccess;
  refreshToken = storedRefresh;
  return { accessToken, refreshToken };
}

export async function persistTokens(tokens: AuthTokens): Promise<void> {
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token ?? refreshToken;

  const writes = [SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.access_token)];
  if (tokens.refresh_token) {
    writes.push(SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refresh_token));
  }
  await Promise.all(writes);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

export function getAccessTokenSync(): string | null {
  return accessToken;
}

export function hasRefreshToken(): boolean {
  return refreshToken !== null;
}

/** Wires the api client to this store. Called once at app boot, before any
 * request can fire, from AuthProvider. */
export function wireApiAuth(onSessionExpired: () => Promise<void> | void): void {
  configureApiAuth({
    getBaseUrl,
    getTenantSlug,
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    onTokensRefreshed: persistTokens,
    onRefreshFailed: async () => {
      await clearTokens();
      await onSessionExpired();
    },
  });
}
