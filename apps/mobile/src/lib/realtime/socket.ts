// Thin wrapper around React Native's WebSocket, isolated behind
// RealtimeSocketLike so connection.ts never touches the real constructor
// directly and a test can inject a fake one instead.
export interface RealtimeSocketLike {
  onopen: (() => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

/**
 * lib.dom.d.ts's `WebSocket` constructor (the type TypeScript resolves
 * `WebSocket` to under Expo's `lib: ["DOM", "ESNext"]`, expo/tsconfig.base)
 * only knows the two-argument browser signature. React Native's actual
 * runtime implementation (Libraries/WebSocket/WebSocket.js) accepts a third
 * argument, `{headers}`, precisely so native/mobile clients can set
 * `Authorization` on the handshake -- something a browser cannot do (plan
 * section 3.5, and apps/api/internal/platform/realtime/http.go's
 * ExtractBearer comment: "the Authorization header (native/mobile
 * clients...)"). This local constructor type documents the runtime
 * contract; the one cast below is the single place that bridges it.
 */
type WebSocketWithHeaders = new (
  url: string,
  protocols: undefined,
  options: { headers: Record<string, string> },
) => RealtimeSocketLike;

/** Builds the /ws/me URL from the REST API's own base URL (http(s) ->
 * ws(s)), matching apps/web/features/notifications/realtime.ts's wsMeUrl. */
export function wsMeUrl(baseUrl: string): string {
  return `${baseUrl.replace(/^http/, "ws")}/ws/me`;
}

/**
 * Opens one /ws/me connection with the bearer token in the Authorization
 * header (never the browser's `bearer.<token>` subprotocol trick -- mobile
 * does not need it) and, when the account has picked a school before a
 * session exists, `X-Tenant` alongside it, mirroring
 * @newsekolah/api-client's REST client (packages/api-client/src/client.ts).
 */
export function createRealtimeSocket(
  baseUrl: string,
  token: string,
  tenantSlug: string | null,
): RealtimeSocketLike {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (tenantSlug) headers["X-Tenant"] = tenantSlug;
  const Ctor = WebSocket as unknown as WebSocketWithHeaders;
  return new Ctor(wsMeUrl(baseUrl), undefined, { headers });
}
