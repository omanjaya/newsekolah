import { describe, expect, it } from "vitest";

import {
  ACCESS_COOKIE_MAX_AGE_SECONDS,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_SAFETY_MARGIN_SECONDS,
  isProtectedDocumentNavigation,
  type DocumentNavigationInput,
} from "./access-cookie";

const documentNav = (
  overrides: Partial<DocumentNavigationInput> = {},
): DocumentNavigationInput => ({
  method: "GET",
  pathname: "/dashboard",
  secFetchDest: "document",
  nextRouterPrefetch: null,
  rsc: null,
  ...overrides,
});

describe("ACCESS_COOKIE_MAX_AGE_SECONDS", () => {
  it("is the access token TTL minus the safety margin", () => {
    expect(ACCESS_COOKIE_MAX_AGE_SECONDS).toBe(
      ACCESS_TOKEN_TTL_SECONDS - REFRESH_SAFETY_MARGIN_SECONDS,
    );
    expect(ACCESS_COOKIE_MAX_AGE_SECONDS).toBe(855);
  });

  it("stays within the documented 30-60s margin band", () => {
    expect(REFRESH_SAFETY_MARGIN_SECONDS).toBeGreaterThanOrEqual(30);
    expect(REFRESH_SAFETY_MARGIN_SECONDS).toBeLessThanOrEqual(60);
  });
});

describe("isProtectedDocumentNavigation", () => {
  it("accepts a plain document GET into the (app) group", () => {
    expect(isProtectedDocumentNavigation(documentNav())).toBe(true);
    expect(isProtectedDocumentNavigation(documentNav({ pathname: "/schedule/bulk" }))).toBe(true);
  });

  it("rejects non-GET methods", () => {
    expect(isProtectedDocumentNavigation(documentNav({ method: "POST" }))).toBe(false);
  });

  it("rejects Next.js Link hover/viewport prefetches", () => {
    expect(isProtectedDocumentNavigation(documentNav({ nextRouterPrefetch: "1" }))).toBe(false);
  });

  it("rejects React Server Component data requests", () => {
    expect(isProtectedDocumentNavigation(documentNav({ rsc: "1" }))).toBe(false);
  });

  it("rejects requests without Sec-Fetch-Dest: document", () => {
    expect(isProtectedDocumentNavigation(documentNav({ secFetchDest: null }))).toBe(false);
    expect(isProtectedDocumentNavigation(documentNav({ secFetchDest: "empty" }))).toBe(false);
  });

  it.each([
    "/login",
    "/login/",
    "/forgot-password",
    "/change-password",
    "/reset-password",
    "/opac",
    "/opac/catalogue",
    "/offline",
    "/verify",
    "/verify/abc123",
    "/branding-icon",
    "/manifest.webmanifest",
    "/sw.js",
    "/favicon.ico",
    "/api/healthz",
    "/_next/static/chunk.js",
  ])("rejects the non-(app) path %s", (pathname) => {
    expect(isProtectedDocumentNavigation(documentNav({ pathname }))).toBe(false);
  });

  it("does not reject an (app) path that merely starts with an excluded prefix's letters", () => {
    // "/opacity-settings" is not "/opac" or "/opac/...": must not false-positive on startsWith.
    expect(isProtectedDocumentNavigation(documentNav({ pathname: "/opacity-settings" }))).toBe(
      true,
    );
  });
});
