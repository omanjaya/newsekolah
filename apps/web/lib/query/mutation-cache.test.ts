import { ApiError } from "@newsekolah/api-client";
import { toast } from "@newsekolah/ui";
import type { Mutation } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { syncCurrentLocale } from "../i18n/current-locale";
import { isAuthRedirecting } from "../session/auth-redirect-flag";

import { createMutationCache } from "./mutation-cache";

vi.mock("@newsekolah/ui", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// auth-redirect-flag.test.ts already covers the flag's own timing; here it
// only needs to be controllable, decoupled from real wall-clock time.
vi.mock("../session/auth-redirect-flag", () => ({ isAuthRedirecting: vi.fn(() => false) }));

/** The cache's callbacks only read `mutation.meta`; nothing else about the
 * mutation matters to them, so a minimal stand-in is enough. */
function mutationWithMeta(meta?: { successMessage?: string; errorToast?: false }) {
  return { meta } as Mutation<unknown, unknown>;
}

describe("createMutationCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAuthRedirecting).mockReturnValue(false);
    syncCurrentLocale("id");
  });

  it("shows a translated error toast by default", () => {
    const cache = createMutationCache();
    const error = new ApiError({ status: 409, code: "SCHEDULE_CONFLICT_CLASS", message: "x" });
    cache.config.onError?.(error, undefined, undefined, mutationWithMeta(), {} as never);
    expect(toast.error).toHaveBeenCalledWith(
      "Jam ini sudah dipakai kelas tersebut untuk mata pelajaran lain. Pilih jam atau kelas yang berbeda.",
    );
  });

  it("translates in English when the locale is English", () => {
    syncCurrentLocale("en");
    const cache = createMutationCache();
    const error = new ApiError({ status: 403, code: "FORBIDDEN", message: "x" });
    cache.config.onError?.(error, undefined, undefined, mutationWithMeta(), {} as never);
    expect(toast.error).toHaveBeenCalledWith(expect.any(String));
    const call = vi.mocked(toast.error).mock.calls[0];
    expect(call?.[0]).not.toContain("tindakan"); // not the Indonesian copy
  });

  it("shows a network message for a raw fetch failure, not the generic fallback", () => {
    const cache = createMutationCache();
    cache.config.onError?.(
      new TypeError("Failed to fetch"),
      undefined,
      undefined,
      mutationWithMeta(),
      {} as never,
    );
    expect(toast.error).toHaveBeenCalledWith("Tidak dapat terhubung ke server, periksa koneksi");
  });

  it("skips the error toast when the mutation opts out (already shown inline)", () => {
    const cache = createMutationCache();
    const error = new ApiError({ status: 422, code: "VALIDATION_FAILED", message: "x" });
    cache.config.onError?.(
      error,
      undefined,
      undefined,
      mutationWithMeta({ errorToast: false }),
      {} as never,
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("skips the error toast while an unauthorized redirect is in flight", () => {
    vi.mocked(isAuthRedirecting).mockReturnValue(true);
    const cache = createMutationCache();
    const error = new ApiError({ status: 401, code: "AUTH_TOKEN_EXPIRED", message: "x" });
    cache.config.onError?.(error, undefined, undefined, mutationWithMeta(), {} as never);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("stays silent on success unless the mutation opts in with a message", () => {
    const cache = createMutationCache();
    cache.config.onSuccess?.(undefined, undefined, undefined, mutationWithMeta(), {} as never);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows the mutation's own success message when it opts in", () => {
    const cache = createMutationCache();
    cache.config.onSuccess?.(
      undefined,
      undefined,
      undefined,
      mutationWithMeta({ successMessage: "Jadwal tersimpan" }),
      {} as never,
    );
    expect(toast.success).toHaveBeenCalledWith("Jadwal tersimpan");
  });
});
