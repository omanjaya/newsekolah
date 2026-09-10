import { z } from "zod";

// Validation messages are i18n keys from @newsekolah/i18n (messages/*.json
// under "validation.*"), not literal text, per docs/04-clean-code.md
// ("Tidak ada string UI hardcoded di kode"). Consumers translate the key
// returned in the zod issue's `message` field before showing it.

export const clientKindSchema = z.enum(["web", "ios", "android"]);
export type ClientKind = z.infer<typeof clientKindSchema>;

export const loginSchema = z.object({
  username: z.string().min(1, "validation.usernameRequired").max(80, "validation.maxLength"),
  password: z.string().min(1, "validation.passwordRequired").max(128, "validation.maxLength"),
  client: clientKindSchema,
  device_id: z.string().max(100, "validation.maxLength").optional(),
  device_name: z.string().max(150, "validation.maxLength").optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "validation.passwordRequired"),
    new_password: z.string().min(8, "validation.passwordMin").max(128, "validation.passwordMax"),
    confirm_password: z.string().min(1, "validation.passwordRequired"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "validation.passwordMismatch",
    path: ["confirm_password"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Only the fields the API accepts; drops the client-side confirmation field. */
export function toChangePasswordRequest(input: ChangePasswordInput) {
  return {
    current_password: input.current_password,
    new_password: input.new_password,
  };
}

export const tenantLookupQuerySchema = z.object({
  q: z.string().min(2, "validation.tenantQueryMin").max(80, "validation.maxLength"),
});
export type TenantLookupQuery = z.infer<typeof tenantLookupQuerySchema>;

export const forgotPasswordSchema = z.object({
  username_or_email: z
    .string()
    .min(1, "validation.usernameRequired")
    .max(120, "validation.maxLength"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * The reset/set-password token itself never goes through this schema: it
 * comes from the URL, not a form field the user types, so there is nothing
 * to validate beyond the new password the user chooses.
 */
export const resetPasswordSchema = z
  .object({
    new_password: z.string().min(8, "validation.passwordMin").max(128, "validation.passwordMax"),
    confirm_password: z.string().min(1, "validation.passwordRequired"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "validation.passwordMismatch",
    path: ["confirm_password"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
