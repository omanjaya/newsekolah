/**
 * Where refresh happens differs by client: web sends the httpOnly
 * `refresh_token` cookie automatically (see openapi.yaml `/v1/auth/login`
 * description) and never reads the token itself, so `getRefreshToken`
 * returns `null`. Mobile has no cookie jar and sends `refresh_token` in the
 * request body, reading and writing it through this interface (typically
 * backed by expo-secure-store). Injecting this keeps @newsekolah/api-client
 * itself platform-agnostic.
 */
export interface TokenStore {
  getRefreshToken(): string | null | Promise<string | null>;
  setTokens(tokens: { accessToken: string; refreshToken?: string }): void | Promise<void>;
  clear(): void | Promise<void>;
}

/** Web default: no refresh token is ever read or stored on the client. */
export const cookieTokenStore: TokenStore = {
  getRefreshToken: () => null,
  setTokens: () => undefined,
  clear: () => undefined,
};
