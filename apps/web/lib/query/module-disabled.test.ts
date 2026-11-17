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

  it("re-reads the public branding too, the only module list an anonymous page has", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();

    refreshSessionOnModuleDisabled(client, disabled);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.tenantBranding() });
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("still re-reads the branding while only /v1/me is already being read", () => {
    const client = new QueryClient();
    const meKey = JSON.stringify(queryKeys.me());
    vi.spyOn(client, "isFetching").mockImplementation((filters) =>
      JSON.stringify(filters?.queryKey) === meKey ? 1 : 0,
    );
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();

    refreshSessionOnModuleDisabled(client, disabled);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.tenantBranding() });
  });

  it("does nothing for any other error, so a plain 403 touches neither session nor branding", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();

    refreshSessionOnModuleDisabled(
      client,
      new ApiError({ status: 403, code: "FORBIDDEN", message: "x" }),
    );

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not stack a second refetch while the session and branding are already being read", () => {
    const client = new QueryClient();
    vi.spyOn(client, "isFetching").mockReturnValue(1);
    const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();

    refreshSessionOnModuleDisabled(client, disabled);

    expect(invalidate).not.toHaveBeenCalled();
  });
});
