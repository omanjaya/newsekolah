# @newsekolah/schemas

Zod schemas shared by `apps/web` and `apps/mobile` for form validation and
API payload shape, kept in sync with `openapi/openapi.yaml`.

- `loginSchema`, `changePasswordSchema`, `tenantLookupQuerySchema` for the
  auth flows in `openapi/openapi.yaml`.
- `apiErrorSchema` matches `components.schemas.Error`.

Every validation message is an `@newsekolah/i18n` message key
(`validation.*`), never literal text: consumers pass the zod issue's
`message` through `translate(locale, key)` before rendering it, so English
and Indonesian error copy stay in one place.
