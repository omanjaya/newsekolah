import { z } from "zod";

// Validation messages are i18n keys from @newsekolah/i18n (messages/*.json
// under "validation.*"), not literal text, per docs/04-clean-code.md
// ("Tidak ada string UI hardcoded di kode"). Consumers translate the key
// returned in the zod issue's `message` field before showing it.

// Length limits, exported so a form's hint ("Minimal 8 karakter") and the
// zod error it shows come from the same number.
export const USERNAME_MAX_LENGTH = 80;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const DEVICE_ID_MAX_LENGTH = 100;
export const DEVICE_NAME_MAX_LENGTH = 150;
export const TENANT_QUERY_MIN_LENGTH = 2;
export const TENANT_QUERY_MAX_LENGTH = 80;
export const USERNAME_OR_EMAIL_MAX_LENGTH = 120;

/**
 * ICU values each `validation.*` key above needs (its `{min}` / `{max}`).
 * zodResolver hands a form only an issue's `message`, not its `minimum` or
 * `maximum`, so a consumer looks the values up here by that message:
 * `translate(locale, message, validationValues[message])`. Every limited
 * field therefore has its own key; a key shared by two different limits
 * could not be given the right number.
 */
export const validationValues: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  "validation.usernameMax": { max: USERNAME_MAX_LENGTH },
  "validation.passwordMin": { min: PASSWORD_MIN_LENGTH },
  "validation.passwordMax": { max: PASSWORD_MAX_LENGTH },
  "validation.deviceIdMax": { max: DEVICE_ID_MAX_LENGTH },
  "validation.deviceNameMax": { max: DEVICE_NAME_MAX_LENGTH },
  "validation.tenantQueryMin": { min: TENANT_QUERY_MIN_LENGTH },
  "validation.tenantQueryMax": { max: TENANT_QUERY_MAX_LENGTH },
  "validation.usernameOrEmailMax": { max: USERNAME_OR_EMAIL_MAX_LENGTH },
};

export const clientKindSchema = z.enum(["web", "ios", "android"]);
export type ClientKind = z.infer<typeof clientKindSchema>;

export const loginSchema = z.object({
  username: z
    .string()
    .min(1, "validation.usernameRequired")
    .max(USERNAME_MAX_LENGTH, "validation.usernameMax"),
  password: z
    .string()
    .min(1, "validation.passwordRequired")
    .max(PASSWORD_MAX_LENGTH, "validation.passwordMax"),
  client: clientKindSchema,
  device_id: z.string().max(DEVICE_ID_MAX_LENGTH, "validation.deviceIdMax").optional(),
  device_name: z.string().max(DEVICE_NAME_MAX_LENGTH, "validation.deviceNameMax").optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "validation.passwordRequired"),
    new_password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, "validation.passwordMin")
      .max(PASSWORD_MAX_LENGTH, "validation.passwordMax"),
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
  q: z
    .string()
    .min(TENANT_QUERY_MIN_LENGTH, "validation.tenantQueryMin")
    .max(TENANT_QUERY_MAX_LENGTH, "validation.tenantQueryMax"),
});
export type TenantLookupQuery = z.infer<typeof tenantLookupQuerySchema>;

export const forgotPasswordSchema = z.object({
  username_or_email: z
    .string()
    .min(1, "validation.usernameRequired")
    .max(USERNAME_OR_EMAIL_MAX_LENGTH, "validation.usernameOrEmailMax"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * The reset/set-password token itself never goes through this schema: it
 * comes from the URL, not a form field the user types, so there is nothing
 * to validate beyond the new password the user chooses.
 */
export const resetPasswordSchema = z
  .object({
    new_password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, "validation.passwordMin")
      .max(PASSWORD_MAX_LENGTH, "validation.passwordMax"),
    confirm_password: z.string().min(1, "validation.passwordRequired"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "validation.passwordMismatch",
    path: ["confirm_password"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
