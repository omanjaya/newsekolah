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
  - On a `401` with `error.code === "AUTH_TOKEN_EXPIRED"`, a single-flight
    call to `/v1/auth/refresh` (cookie for web, `tokenStore.getRefreshToken()`
    body for mobile) followed by exactly one retry of the original request.
  - Throws `ApiError { status, code, message, details, requestId }` for any
    other failure, instead of returning `{ data, error }`.
  - `AbortSignal` passes straight through via the standard `init.signal`
    option on any call.
- `queryKeys` centralizes TanStack Query cache keys so web and mobile
  invalidate the same entries.
- `@newsekolah/api-client/react` exports `useMe`, `useLogin`, `useLogout`,
  `useSessions`, `useRevokeSession`, `useChangePassword`,
  `useTenantBranding`, `useTenantLookup`, each taking the client instance as
  its first argument. `@tanstack/react-query` and `react` are peer
  dependencies.

## Scripts

- `pnpm generate`: regenerate `src/gen/schema.d.ts` from the OpenAPI contract.
- `pnpm build`: bundle `index` and `hooks/index` with tsup.
- `pnpm test`: Vitest + msw, covering header injection, idempotency keys,
  non-401 errors, and the refresh/retry/single-flight behavior.
