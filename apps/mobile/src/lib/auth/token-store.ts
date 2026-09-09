// SecureStore-backed TokenStore for @newsekolah/api-client: encrypted,
// per-app keychain/keystore entries, mirrored in memory so the client's
// header logic (and getAccessTokenSync below) can read the access token
// synchronously. `me` itself is never persisted here -- AuthProvider keeps
// it in memory only and re-fetches GET /v1/me on cold start.
import * as SecureStore from "expo-secure-store";
import type { TokenStore } from "@newsekolah/api-client";

const ACCESS_TOKEN_KEY = "newsekolah.access_token";
const REFRESH_TOKEN_KEY = "newsekolah.refresh_token";

let accessToken: string | null = null;
let refreshToken: string | null = null;

export async function loadStoredTokens(): Promise<{ accessToken: string | null }> {
  const [storedAccess, storedRefresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  accessToken = storedAccess;
  refreshToken = storedRefresh;
  return { accessToken };
}

export function getAccessTokenSync(): string | null {
  return accessToken;
}

/**
 * Implements @newsekolah/api-client's `TokenStore`: refresh-by-body for
 * mobile (no cookie jar -- see the package's own token-store.ts doc
 * comment). Wired into `createApiClient` by `getApiClient()`, so the
 * package's built-in single-flight refresh reads and writes tokens here
 * directly; nothing in this app calls `/v1/auth/refresh` itself anymore.
 */
export const secureTokenStore: TokenStore = {
  getRefreshToken: () => refreshToken,
  setTokens: async (tokens) => {
    accessToken = tokens.accessToken;
    const writes = [SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken)];
    if (tokens.refreshToken) {
      refreshToken = tokens.refreshToken;
      writes.push(SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken));
    }
    await Promise.all(writes);
  },
  clear: async () => {
    accessToken = null;
    refreshToken = null;
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
  },
};
