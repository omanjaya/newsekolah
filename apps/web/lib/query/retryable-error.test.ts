import { ApiError } from "@newsekolah/api-client";
import { describe, expect, it } from "vitest";

import { isRetryableError } from "./retryable-error";

describe("isRetryableError", () => {
  it("treats a 4xx ApiError as final", () => {
    expect(
      isRetryableError(new ApiError({ status: 403, code: "NOT_TEACHING_THIS_CLASS", message: "" })),
    ).toBe(false);
    expect(isRetryableError(new ApiError({ status: 404, code: "NOT_FOUND", message: "" }))).toBe(
      false,
    );
  });

  it("treats a 5xx ApiError, a network failure or an unknown error as retryable", () => {
    expect(isRetryableError(new ApiError({ status: 503, code: "UNAVAILABLE", message: "" }))).toBe(
      true,
    );
    expect(isRetryableError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryableError(undefined)).toBe(true);
  });
});
