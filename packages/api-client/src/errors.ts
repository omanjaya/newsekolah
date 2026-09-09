export interface ApiErrorDetail {
  field: string;
  code: string;
  message?: string;
}

export interface ApiErrorParams {
  status: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  requestId?: string;
}

/**
 * Thrown by every `NewsekolahApiClient` call that receives a non-2xx
 * response (after the single 401 refresh-and-retry). `code` is the stable
 * SCREAMING_SNAKE_CASE value from `components.schemas.Error` in
 * openapi/openapi.yaml; UI code maps it to `errors.<code>` in
 * @newsekolah/i18n rather than showing `message` (the server's own
 * localized text) directly, so client-side locale switches stay consistent.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorDetail[];
  readonly requestId?: string;

  constructor(params: ApiErrorParams) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.requestId = params.requestId;
  }
}
