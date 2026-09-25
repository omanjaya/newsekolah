import { ApiError } from "@newsekolah/api-client";
import type { Mutation } from "@tanstack/react-query";
import { setLocale } from "@/i18n/t";

const mockShowToast = jest.fn();
jest.mock("@/components/ui/Toast", () => ({
  showToast: (...args: unknown[]) => {
    mockShowToast(...args);
  },
}));

const mockIsAuthRedirecting = jest.fn(() => false);
jest.mock("@/lib/api/auth-redirect-flag", () => ({
  isAuthRedirecting: () => mockIsAuthRedirecting(),
  markAuthRedirect: jest.fn(),
}));

// Imported after the mocks above so mutation-cache.ts picks up the mocked
// modules instead of the real showToast/isAuthRedirecting.
import { createMutationCache } from "@/lib/api/mutation-cache";

function mutationWithMeta(meta?: { successMessage?: string; errorToast?: false }) {
  return { meta } as Mutation<unknown, unknown>;
}

describe("createMutationCache (mobile)", () => {
  beforeEach(() => {
    mockShowToast.mockClear();
    mockIsAuthRedirecting.mockReset().mockReturnValue(false);
    setLocale("id");
  });

  it("shows a translated error toast by default", () => {
    const cache = createMutationCache();
    const error = new ApiError({ status: 409, code: "SCHEDULE_CONFLICT_CLASS", message: "x" });
    cache.config.onError?.(error, undefined, undefined, mutationWithMeta(), {} as never);
    expect(mockShowToast).toHaveBeenCalledWith(
      "Jam ini sudah dipakai kelas tersebut untuk mata pelajaran lain. Pilih jam atau kelas yang berbeda.",
      "error",
    );
  });

  it("shows a network message for a raw fetch failure, not the generic fallback", () => {
    const cache = createMutationCache();
    cache.config.onError?.(
      new TypeError("Network request failed"),
      undefined,
      undefined,
      mutationWithMeta(),
      {} as never,
    );
    expect(mockShowToast).toHaveBeenCalledWith(
      "Tidak dapat terhubung ke server, periksa koneksi",
      "error",
    );
  });

  it("skips the error toast when the mutation opts out", () => {
    const cache = createMutationCache();
    const error = new ApiError({ status: 422, code: "VALIDATION_FAILED", message: "x" });
    cache.config.onError?.(
      error,
      undefined,
      undefined,
      mutationWithMeta({ errorToast: false }),
      {} as never,
    );
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("skips the error toast while an unauthorized redirect is in flight", () => {
    mockIsAuthRedirecting.mockReturnValue(true);
    const cache = createMutationCache();
    const error = new ApiError({ status: 401, code: "AUTH_TOKEN_EXPIRED", message: "x" });
    cache.config.onError?.(error, undefined, undefined, mutationWithMeta(), {} as never);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("stays silent on success unless the mutation opts in with a message", () => {
    const cache = createMutationCache();
    cache.config.onSuccess?.(undefined, undefined, undefined, mutationWithMeta(), {} as never);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("shows the mutation's own success message when it opts in", () => {
    const cache = createMutationCache();
    cache.config.onSuccess?.(
      undefined,
      undefined,
      undefined,
      mutationWithMeta({ successMessage: "Izin diajukan" }),
      {} as never,
    );
    expect(mockShowToast).toHaveBeenCalledWith("Izin diajukan", "success");
  });
});
