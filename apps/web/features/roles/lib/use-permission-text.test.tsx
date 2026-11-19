import { renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import id from "../../../messages/id.json";

import { usePermissionText } from "./use-permission-text";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="id" messages={{ app: { roles: id.app.roles } }}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("usePermissionText", () => {
  it("reads a known permission from the roles catalog, not the API sentence", () => {
    const { result } = renderHook(() => usePermissionText(), { wrapper });
    expect(result.current("manage_master_data", "Manage master data")).toEqual({
      label: id.app.roles.permissions.manage_master_data.label,
      description: id.app.roles.permissions.manage_master_data.description,
    });
  });

  it("falls back to the code and the API description for an unknown code", () => {
    const { result } = renderHook(() => usePermissionText(), { wrapper });
    expect(result.current("brand_new_code", "Something new")).toEqual({
      label: "brand_new_code",
      description: "Something new",
    });
  });
});
