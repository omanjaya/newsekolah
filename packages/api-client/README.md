# @newsekolah/api-client

Typed API client generated from `openapi/openapi.yaml`.

- `pnpm generate` runs `openapi-typescript` against the contract and writes
  `src/gen/schema.d.ts`. That file is committed so consumers (and CI) don't
  need to run codegen just to typecheck.
- `createApiClient(options)` wraps `openapi-fetch` with the cross-cutting
  behavior every request needs:
  - `Authorization: Bearer <token>` from `getAccessToken()`.
  - `Accept-Language` from `getLocale()` (defaults to `id`).
  - `X-Client` (caller-supplied, e.g. `web/1.4.0` or `mobile/ios/1.4.0`).
  - `X-Tenant` when `tenantSlug` is set.
  - `Idempotency-Key` (a UUID) on every `POST`/`PUT`/`PATCH`/`DELETE`.
  - On a `401` with `AUTH_TOKEN_EXPIRED`, `AUTH_SESSION_REVOKED` or
    `AUTH_TOKEN_INVALID` (or one sent with no token), a single-flight call
    to `/v1/auth/refresh` (cookie for web, `tokenStore.getRefreshToken()`
    body for mobile) followed by exactly one retry of the original request.
    A request sent with no token right after the server refused the page
    load's refresh (an anonymous visit) gets its `401` back without a
    second refresh, and `onUnauthorized` still hears of it; a later one
    (a refetch on focus, after another tab signed in) refreshes as usual.
  - The first request of a page load without a token first restores the
    session with one refresh, unless `skipBootRefresh()` says there is none
    to restore (the web's public pages without a refresh cookie); it is
    asked again on the next request until it says false.
  - On the web, the tabs of one origin share the refresh cookie, so their
    refreshes take turns under a Web Lock and each announces its new
    access token on a BroadcastChannel; a tab whose token stops working
    takes the announced one instead of rotating the cookie again
    (`src/cross-tab.ts`, docs/08-security.md section 2).
  - Throws `ApiError { status, code, message, details, requestId }` for any
    other failure, instead of returning `{ data, error }`.
  - `AbortSignal` passes straight through via the standard `init.signal`
    option on any call.
  - `client.forgetAccessToken()` drops the token the client kept from its
    last refresh (and the answer of a refresh still on its way). Call it
    whenever the app ends a session on purpose, with its own copy, and
    right before it takes a new identity's token (`useStartSession` does
    so for every sign-in); a failed refresh does it on its own.
- `queryKeys` centralizes TanStack Query cache keys so web and mobile
  invalidate the same entries.
- `@newsekolah/api-client/react` exports `useMe`, `useLogin`, `useLogout`,
  `useSessions`, `useRevokeSession`, `useChangePassword`,
  `useTenantBranding`, `useTenantLookup`, each taking the client instance as
  its first argument, plus `useStartSession` (what every sign-in does with
  its tokens, also taking the client first) and `clearReaderCache` (empties the cache when the reader
  changes, keeping the tenant's branding). `@tanstack/react-query` and
  `react` are peer dependencies.

## Scripts

- `pnpm generate`: regenerate `src/gen/schema.d.ts` from the OpenAPI contract.
- `pnpm build`: bundle `index` and `hooks/index` with tsup.
- `pnpm test`: Vitest + msw, covering header injection, idempotency keys,
  non-401 errors, the refresh/retry/single-flight behavior, and several
  tabs sharing one refresh cookie.
