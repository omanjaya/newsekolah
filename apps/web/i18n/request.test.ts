import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  branding: null as { locale?: "id" | "en"; timezone?: string } | null,
  // The user_locale cookie UserLocaleSync mirrors from Me.locale.
  userLocale: undefined as string | undefined,
}));

// getRequestConfig hands back the callback, so the test can call it.
vi.mock("next-intl/server", () => ({
  getRequestConfig: (callback: unknown) => callback,
}));
vi.mock("../lib/tenant/get-branding.server", () => ({
  getTenantBrandingServer: () => Promise.resolve(mocks.branding),
}));
vi.mock("../lib/i18n/get-messages", () => ({ getMessages: () => ({}) }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === "user_locale" && mocks.userLocale !== undefined
          ? { name, value: mocks.userLocale }
          : undefined,
    }),
}));
vi.mock("../messages/features", () => ({}));

import requestConfig from "./request";

const config = requestConfig as unknown as () => Promise<{ locale: string; timeZone: string }>;

describe("i18n request config", () => {
  beforeEach(() => {
    mocks.branding = null;
    mocks.userLocale = undefined;
  });

  // Without a timeZone next-intl formats in the server's zone (UTC), and
  // every client provider inherits it, so instants landed on the wrong day.
  it("formats in the school's time zone", async () => {
    mocks.branding = { locale: "id", timezone: "Asia/Jayapura" };
    await expect(config()).resolves.toMatchObject({ locale: "id", timeZone: "Asia/Jayapura" });
  });

  it("falls back to the tenants table default without branding", async () => {
    await expect(config()).resolves.toMatchObject({ locale: "id", timeZone: "Asia/Makassar" });
  });

  it("renders in the user's own preference ahead of the school's language", async () => {
    mocks.branding = { locale: "id", timezone: "Asia/Makassar" };
    mocks.userLocale = "en";
    await expect(config()).resolves.toMatchObject({ locale: "en" });
  });

  it("follows an English-language school when the user has no preference", async () => {
    mocks.branding = { locale: "en", timezone: "Asia/Makassar" };
    await expect(config()).resolves.toMatchObject({ locale: "en" });
  });
});
