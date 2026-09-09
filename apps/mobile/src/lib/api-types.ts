// Temporary: replace with @newsekolah/api-client once published in the workspace.
//
// Types below are hand-derived from openapi/openapi.yaml (components.schemas).
// Keep them in sync manually until the generated client lands; do not add
// fields that are not in the contract.

export type ClientKind = "web" | "ios" | "android";

export interface Role {
  id: string;
  slug: string;
  name: string;
  is_primary: boolean;
}

export type DutyScopeKind = "school" | "class" | "student";

export interface Duty {
  slug: string;
  scope_kind: DutyScopeKind;
  scope_id?: string;
  scope_label?: string;
}

export interface TenantBranding {
  tenant_id: string;
  slug: string;
  name: string;
  short_name?: string;
  tagline?: string;
  logo_url?: string;
  favicon_url?: string;
  accent_color: string;
  locale: "id" | "en";
  timezone: string;
}

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  city?: string;
}

export type ProfileKind = "student" | "teacher" | "staff" | "parent";

export interface Me {
  id: string;
  username: string;
  email?: string;
  name: string;
  avatar_url?: string;
  profile_kind?: ProfileKind;
  roles: Role[];
  permissions: string[];
  duties?: Duty[];
  active_academic_year?: { id: string; label: string } | null;
  tenant: TenantBranding;
  must_change_password: boolean;
  impersonated_by?: { user_id?: string; name?: string } | null;
}

export interface LoginRequest {
  username: string;
  password: string;
  client: ClientKind;
  device_id?: string;
  device_name?: string;
}

export interface AuthTokens {
  token_type: "Bearer";
  access_token: string;
  access_expires_at: string;
  refresh_token?: string;
  refresh_expires_at?: string;
  user: Me;
}

export interface Session {
  id: string;
  client: ClientKind;
  device_name?: string;
  ip?: string;
  user_agent?: string;
  created_at: string;
  last_seen_at: string;
  is_current: boolean;
}

export interface ApiErrorDetail {
  field: string;
  code: string;
  message?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    request_id?: string;
  };
}

/** Thrown by the api client for any non-2xx response. `code` is the stable
 * machine code from the Error schema (e.g. AUTH_TOKEN_EXPIRED, VALIDATION_FAILED). */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: ApiErrorDetail[];
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details;
    this.requestId = body.error.request_id;
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const errorValue = value.error;
  return (
    typeof errorValue === "object" &&
    errorValue !== null &&
    "code" in errorValue &&
    "message" in errorValue
  );
}
