// Request/response shapes come from @newsekolah/api-client's generated
// OpenAPI schema (packages/api-client/src/gen/schema.d.ts), not a
// hand-maintained copy of openapi/openapi.yaml. These are readable local
// aliases for the `components["schemas"]` entries this app uses; add more
// here as screens need them instead of redeclaring shapes locally.
import type { components } from "@newsekolah/api-client";

export type ClientKind = components["schemas"]["ClientKind"];
export type Role = components["schemas"]["Role"];
export type Duty = NonNullable<components["schemas"]["Me"]["duties"]>[number];
export type TenantBranding = components["schemas"]["TenantBranding"];
export type TenantSummary = components["schemas"]["TenantSummary"];
export type Me = components["schemas"]["Me"];
export type ProfileKind = NonNullable<Me["profile_kind"]>;
export type AuthTokens = components["schemas"]["AuthTokens"];
export type Session = components["schemas"]["Session"];
