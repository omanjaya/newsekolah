import { z } from "zod";

/**
 * Shared by every dialog that asks for a current TOTP code or a recovery
 * code (confirm enrolment, disable, regenerate codes): the API accepts
 * either string in the same field, so the client does not validate a
 * fixed length or character set.
 */
export const mfaCodeSchema = z.object({
  code: z.string().min(1, "validation.required"),
});
export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;
