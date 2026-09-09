import { z } from "zod";

// Mirrors components.schemas.Error in openapi/openapi.yaml. `code` is the
// stable SCREAMING_SNAKE_CASE machine code (see @newsekolah/i18n
// messages/*.json "errors.*" for the localized text keyed by this code);
// `message` is the server's own localized text, shown only as a fallback
// when the client has no matching "errors.<code>" key.
export const apiErrorDetailSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string().optional(),
});
export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(apiErrorDetailSchema).optional(),
    request_id: z.string().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
