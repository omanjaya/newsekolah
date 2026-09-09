import { describe, expect, it } from "vitest";

import { apiErrorSchema } from "./api-error.js";

describe("apiErrorSchema", () => {
  it("accepts the minimal shape from the OpenAPI Error schema", () => {
    const result = apiErrorSchema.safeParse({
      error: { code: "AUTH_TOKEN_EXPIRED", message: "Sesi berakhir" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts details and request_id", () => {
    const result = apiErrorSchema.safeParse({
      error: {
        code: "VALIDATION_FAILED",
        message: "Data tidak valid",
        details: [{ field: "username", code: "required" }],
        request_id: "req_123",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a body missing the error envelope", () => {
    expect(apiErrorSchema.safeParse({ code: "X", message: "Y" }).success).toBe(false);
  });
});
