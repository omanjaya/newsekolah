import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  DEVICE_ID_MAX_LENGTH,
  DEVICE_NAME_MAX_LENGTH,
  forgotPasswordSchema,
  loginSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  resetPasswordSchema,
  TENANT_QUERY_MAX_LENGTH,
  tenantLookupQuerySchema,
  USERNAME_MAX_LENGTH,
  USERNAME_OR_EMAIL_MAX_LENGTH,
  validationValues,
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

  it("rejects an empty value with a message naming both accepted forms", () => {
    const result = forgotPasswordSchema.safeParse({ username_or_email: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("validation.usernameOrEmailRequired");
    }
  });

  it("rejects a value of only whitespace as empty", () => {
    const result = forgotPasswordSchema.safeParse({ username_or_email: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("validation.usernameOrEmailRequired");
    }
  });

  it("sends the value without surrounding whitespace", () => {
    const result = forgotPasswordSchema.safeParse({ username_or_email: "  guru01 " });
    expect(result.success && result.data.username_or_email).toBe("guru01");
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

describe("validationValues", () => {
  const tooLong = (limit: number) => "x".repeat(limit + 1);

  // Every length issue the auth schemas can raise, too short and too long.
  const failures = [
    loginSchema.safeParse({
      username: tooLong(USERNAME_MAX_LENGTH),
      password: tooLong(PASSWORD_MAX_LENGTH),
      client: "web",
      device_id: tooLong(DEVICE_ID_MAX_LENGTH),
      device_name: tooLong(DEVICE_NAME_MAX_LENGTH),
    }),
    changePasswordSchema.safeParse({
      current_password: "old",
      new_password: "abc",
      confirm_password: "abc",
    }),
    changePasswordSchema.safeParse({
      current_password: "old",
      new_password: tooLong(PASSWORD_MAX_LENGTH),
      confirm_password: tooLong(PASSWORD_MAX_LENGTH),
    }),
    resetPasswordSchema.safeParse({ new_password: "abc", confirm_password: "abc" }),
    tenantLookupQuerySchema.safeParse({ q: "a" }),
    tenantLookupQuerySchema.safeParse({ q: tooLong(TENANT_QUERY_MAX_LENGTH) }),
    forgotPasswordSchema.safeParse({ username_or_email: tooLong(USERNAME_OR_EMAIL_MAX_LENGTH) }),
  ];
  const lengthIssues = failures.flatMap((result) =>
    result.success
      ? []
      : result.error.issues.filter(
          (issue) =>
            (issue.code === "too_small" && Number(issue.minimum) > 1) || issue.code === "too_big",
        ),
  );

  it("covers every length issue under test", () => {
    expect(lengthIssues).toHaveLength(10);
  });

  it("gives each length message the limit its schema enforces", () => {
    for (const issue of lengthIssues) {
      const expected =
        issue.code === "too_small"
          ? { min: Number(issue.minimum) }
          : issue.code === "too_big"
            ? { max: Number(issue.maximum) }
            : undefined;
      expect(validationValues[issue.message], issue.message).toEqual(expected);
    }
  });

  it("keeps the password minimum at 8 characters", () => {
    expect(validationValues["validation.passwordMin"]).toEqual({ min: 8 });
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});
