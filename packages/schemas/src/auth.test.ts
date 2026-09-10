import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  tenantLookupQuerySchema,
} from "./auth.js";

describe("loginSchema", () => {
  it("accepts a valid payload", () => {
    const result = loginSchema.safeParse({
      username: "guru01",
      password: "s3cret!",
      client: "web",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty username with an i18n key, not literal text", () => {
    const result = loginSchema.safeParse({ username: "", password: "x", client: "web" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("validation.usernameRequired");
    }
  });

  it("rejects an unknown client kind", () => {
    const result = loginSchema.safeParse({ username: "a", password: "b", client: "desktop" });
    expect(result.success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  const base = {
    current_password: "oldpassword",
    new_password: "newpassword1",
    confirm_password: "newpassword1",
  };

  it("accepts matching passwords of sufficient length", () => {
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a new password shorter than 8 characters", () => {
    const result = changePasswordSchema.safeParse({
      ...base,
      new_password: "short",
      confirm_password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "validation.passwordMin")).toBe(
        true,
      );
    }
  });

  it("rejects a new password longer than 128 characters", () => {
    const long = "a".repeat(129);
    const result = changePasswordSchema.safeParse({
      ...base,
      new_password: long,
      confirm_password: long,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "validation.passwordMax")).toBe(
        true,
      );
    }
  });

  it("rejects mismatched confirmation with the mismatch key on confirm_password", () => {
    const result = changePasswordSchema.safeParse({ ...base, confirm_password: "different1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "confirm_password");
      expect(issue?.message).toBe("validation.passwordMismatch");
    }
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts a username or email", () => {
    expect(forgotPasswordSchema.safeParse({ username_or_email: "guru01" }).success).toBe(true);
  });

  it("rejects an empty value with an i18n key", () => {
    const result = forgotPasswordSchema.safeParse({ username_or_email: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("validation.usernameRequired");
    }
  });
});

describe("resetPasswordSchema", () => {
  it("accepts matching passwords of sufficient length", () => {
    const result = resetPasswordSchema.safeParse({
      new_password: "newpassword1",
      confirm_password: "newpassword1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a new password shorter than 8 characters", () => {
    const result = resetPasswordSchema.safeParse({
      new_password: "short",
      confirm_password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "validation.passwordMin")).toBe(
        true,
      );
    }
  });

  it("rejects mismatched confirmation with the mismatch key on confirm_password", () => {
    const result = resetPasswordSchema.safeParse({
      new_password: "newpassword1",
      confirm_password: "different1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "confirm_password");
      expect(issue?.message).toBe("validation.passwordMismatch");
    }
  });
});

describe("tenantLookupQuerySchema", () => {
  it("rejects a query shorter than 2 characters", () => {
    expect(tenantLookupQuerySchema.safeParse({ q: "a" }).success).toBe(false);
  });

  it("accepts a query of 2 or more characters", () => {
    expect(tenantLookupQuerySchema.safeParse({ q: "sm" }).success).toBe(true);
  });
});
