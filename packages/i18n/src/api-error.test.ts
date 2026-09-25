import { ApiError } from "@newsekolah/api-client";
import { describe, expect, it, vi } from "vitest";

import { apiErrorMessageKey } from "./api-error.js";
import { translate } from "./translator.js";

describe("apiErrorMessageKey", () => {
  it("maps a known ApiError code to its errors.* key", () => {
    const error = new ApiError({ status: 409, code: "SCHEDULE_CONFLICT_CLASS", message: "x" });
    expect(apiErrorMessageKey(error)).toBe("errors.SCHEDULE_CONFLICT_CLASS");
    expect(translate("id", apiErrorMessageKey(error))).toBe(
      "Jam ini sudah dipakai kelas tersebut untuk mata pelajaran lain. Pilih jam atau kelas yang berbeda.",
    );
  });

  it("falls back to errors.UNKNOWN for a code the catalog does not document", () => {
    const error = new ApiError({ status: 500, code: "SOMETHING_NEW", message: "x" });
    expect(apiErrorMessageKey(error)).toBe("errors.UNKNOWN");
  });

  it("maps a TypeError (fetch never reached the server) to errors.NETWORK", () => {
    expect(apiErrorMessageKey(new TypeError("Failed to fetch"))).toBe("errors.NETWORK");
  });

  it("maps an AbortError DOMException (request timeout) to errors.NETWORK", () => {
    expect(apiErrorMessageKey(new DOMException("aborted", "AbortError"))).toBe("errors.NETWORK");
  });

  it("maps anything else to errors.UNKNOWN", () => {
    expect(apiErrorMessageKey(new Error("boom"))).toBe("errors.UNKNOWN");
    expect(apiErrorMessageKey("boom")).toBe("errors.UNKNOWN");
    expect(apiErrorMessageKey(undefined)).toBe("errors.UNKNOWN");
  });

  it("treats being offline as a network failure regardless of the error's own shape", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(apiErrorMessageKey(new Error("some other failure"))).toBe("errors.NETWORK");
    vi.unstubAllGlobals();
  });
});
