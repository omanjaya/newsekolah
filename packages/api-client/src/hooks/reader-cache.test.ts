import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { queryKeys } from "../query-keys.js";

import { clearReaderCache, isTenantBrandingQuery } from "./reader-cache.js";

describe("clearReaderCache", () => {
  it("drops everything read for the previous reader but keeps the tenant's branding", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.me(), { id: "earlier" });
    queryClient.setQueryData(queryKeys.notificationsUnreadCount(), { count: 3 });
    queryClient.setQueryData(queryKeys.tenantBranding(), { name: "School" });
    queryClient.getMutationCache().build(queryClient, { mutationKey: ["profile", "update"] });
    expect(queryClient.getMutationCache().getAll()).toHaveLength(1);

    clearReaderCache(queryClient);

    expect(queryClient.getQueryData(queryKeys.me())).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.notificationsUnreadCount())).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.tenantBranding())).toEqual({ name: "School" });
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("recognises the branding key for any tenant slug, and nothing else", () => {
    expect(isTenantBrandingQuery(queryKeys.tenantBranding())).toBe(true);
    expect(isTenantBrandingQuery(queryKeys.tenantBranding("sman1"))).toBe(true);
    expect(isTenantBrandingQuery(queryKeys.tenantLookup("sman"))).toBe(false);
    expect(isTenantBrandingQuery(queryKeys.me())).toBe(false);
  });
});
