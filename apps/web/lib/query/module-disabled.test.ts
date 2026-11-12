import { ApiError, queryKeys } from "@newsekolah/api-client";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { isModuleDisabledError, refreshSessionOnModuleDisabled } from "./module-disabled";

const disabled = new ApiError({ status: 403, code: "MODULE_DISABLED", message: "x" });

describe("isModuleDisabledError", () => {
  it("recognises only the 403 MODULE_DISABLED answer", () => {
    expect(isModuleDisabledError(disabled)).toBe(true);
    expect(
      isModuleDisabledError(new ApiError({ status: 403, code: "FORBIDDEN", message: "x" })),
    ).toBe(false);
    expect(
      isModuleDisabledError(
        new ApiError({ status: 401, code: "AUTH_TOKEN_EXPIRED", message: "x" }),
      ),
    ).toBe(false);
    expect(isModuleDisabledError(new TypeError("Failed to fetch"))).toBe(false);
  });
});

describe("refreshSessionOnModuleDisabled", () => {
  it("re-reads /v1/me so the module list catches up", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();

    refreshSessionOnModuleDisabled(client, disabled);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.me() });
  });

  it("does nothing for any other error, so a plain 403 never touches the session", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();

    refreshSessionOnModuleDisabled(
      client,
      new ApiError({ status: 403, code: "FORBIDDEN", message: "x" }),
    );

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not stack a second refetch while the session is already being read", () => {
    const client = new QueryClient();
    vi.spyOn(client, "isFetching").mockReturnValue(1);
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();

    refreshSessionOnModuleDisabled(client, disabled);

    expect(invalidate).not.toHaveBeenCalled();
  });
});
