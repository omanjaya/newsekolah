/**
 * The origin presigned object-storage URLs point at, for the CSP: the
 * browser PUTs uploads (logo, favicon, avatar, attachments) straight to it
 * and shows stored images from it, so connect-src and img-src must allow
 * it whenever it is not this app's own origin.
 *
 * Read from the environment, in the order the API itself signs URLs
 * (apps/api/internal/platform/storage: S3_PUBLIC_ENDPOINT when set,
 * otherwise S3_ENDPOINT):
 *
 * 1. NEXT_PUBLIC_S3_PUBLIC_ORIGIN, the web app's own setting
 *    (docker-compose.prod.yml passes the API's S3_PUBLIC_ENDPOINT here).
 * 2. S3_PUBLIC_ENDPOINT, when the web server shares the API's environment.
 * 3. S3_ENDPOINT (with S3_USE_SSL for a bare host:port), the endpoint the
 *    API signs against when no public one is configured.
 *
 * Returns "" when none is set or parses: the CSP then omits it, which is
 * right for a same-origin deployment that 'self' already covers.
 */
export function storageOriginFromEnv(env: Readonly<Record<string, string | undefined>>): string {
  const candidates: [string | undefined, boolean][] = [
    [env.NEXT_PUBLIC_S3_PUBLIC_ORIGIN, true],
    [env.S3_PUBLIC_ENDPOINT, true],
    [env.S3_ENDPOINT, env.S3_USE_SSL === "true"],
  ];
  for (const [raw, secureWhenBare] of candidates) {
    const origin = toOrigin(raw, secureWhenBare);
    if (origin) return origin;
  }
  return "";
}

function toOrigin(raw: string | undefined, secureWhenBare: boolean): string {
  const value = raw?.trim();
  if (!value) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `${secureWhenBare ? "https" : "http"}://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}
