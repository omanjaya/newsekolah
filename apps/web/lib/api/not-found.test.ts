import { ApiError } from "@newsekolah/api-client";
import { describe, expect, it } from "vitest";

import { isNotFoundError } from "./not-found";

const apiError = (status: number, code: string, details?: { field: string; code: string }[]) =>
  new ApiError({ status, code, message: code, details });

describe("isNotFoundError", () => {
  it("treats a 404 as not found", () => {
    expect(isNotFoundError(apiError(404, "SUPERVISION_OBSERVATION_NOT_FOUND"))).toBe(true);
  });

  it("treats a malformed id in the path as not found", () => {
    expect(
      isNotFoundError(
        apiError(400, "VALIDATION_FAILED", [{ field: "id", code: "INVALID_FORMAT" }]),
      ),
    ).toBe(true);
  });

  it("keeps other failures as load failures", () => {
    expect(isNotFoundError(apiError(500, "INTERNAL"))).toBe(false);
    expect(isNotFoundError(apiError(400, "VALIDATION_FAILED"))).toBe(false);
    expect(
      isNotFoundError(
        apiError(400, "VALIDATION_FAILED", [{ field: "limit", code: "OUT_OF_RANGE" }]),
      ),
    ).toBe(false);
    expect(isNotFoundError(new Error("boom"))).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
  });
});
