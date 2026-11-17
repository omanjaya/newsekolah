import en from "@newsekolah/i18n/messages/en.json";
import id from "@newsekolah/i18n/messages/id.json";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => `errors.${key}` }));

import { useApiErrorMessage } from "./api-error-message";

/** The platform console codes in apps/api/internal/platform/httpx/errors_platform.go. */
const PLATFORM_ERROR_CODES = [
  "PLATFORM_TENANCY_DISABLED",
  "PLATFORM_TENANT_NOT_FOUND",
  "PLATFORM_SLUG_TAKEN",
  "PLATFORM_DOMAIN_TAKEN",
  "PLATFORM_UNKNOWN_MODULE",
  "PLATFORM_EXPORT_NOT_FOUND",
  "PLATFORM_STORAGE_DISABLED",
  "PLATFORM_TELEGRAM_TOKEN_MISSING",
  "PLATFORM_TELEGRAM_CHAT_MISSING",
  "PLATFORM_TELEGRAM_UNREACHABLE",
  "PLATFORM_TELEGRAM_API_ERROR",
] as const;

describe("useApiErrorMessage", () => {
  it.each(PLATFORM_ERROR_CODES)("translates %s instead of falling back to UNKNOWN", (code) => {
    const { result } = renderHook(() => useApiErrorMessage());
    expect(result.current(code)).toBe(`errors.${code}`);
  });

  it.each(PLATFORM_ERROR_CODES)("has an id and en message for %s", (code) => {
    const idErrors: Record<string, string> = id.errors;
    const enErrors: Record<string, string> = en.errors;
    expect(idErrors[code]?.trim()).toBeTruthy();
    expect(enErrors[code]?.trim()).toBeTruthy();
  });

  it("falls back to UNKNOWN for a code the catalog does not know", () => {
    const { result } = renderHook(() => useApiErrorMessage());
    expect(result.current("SOMETHING_NEW")).toBe("errors.UNKNOWN");
  });
});
