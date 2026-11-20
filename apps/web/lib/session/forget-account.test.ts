import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeDraft } from "../drafts/draft-storage";

import { forgetAccountOnThisBrowser, forgetImpersonationOnThisBrowser } from "./forget-account";

const cachePolicy = vi.hoisted(() => ({
  deleteAccountScopedCaches: vi.fn(() => Promise.resolve([] as string[])),
}));

vi.mock("../pwa/cache-policy", () => cachePolicy);

beforeEach(() => {
  window.localStorage.clear();
  cachePolicy.deleteAccountScopedCaches.mockClear();
});

describe("forgetAccountOnThisBrowser", () => {
  it("removes the drafts of every owner and starts deleting account caches", () => {
    writeDraft("school-1:user-a", "counseling", "new", { text: "a" });
    writeDraft("school-1:user-b", "attendance", "session-1", { text: "b" });
    writeDraft("school-1:user-a~admin-1", "journal", "class-1:subject-1:2026-09-21", { text: "c" });
    window.localStorage.setItem("newsekolah:theme", "dark");

    forgetAccountOnThisBrowser();

    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem("newsekolah:theme")).toBe("dark");
    expect(cachePolicy.deleteAccountScopedCaches).toHaveBeenCalledTimes(1);
  });
});

describe("forgetImpersonationOnThisBrowser", () => {
  it("removes only the impersonated session's drafts and starts deleting account caches", () => {
    writeDraft("school-1:user-a~admin-1", "journal", "class-1:subject-1:2026-09-21", { text: "a" });
    writeDraft("school-1:admin-1", "counseling", "new", { text: "b" });

    forgetImpersonationOnThisBrowser("school-1:user-a~admin-1");

    expect(window.localStorage.length).toBe(1);
    expect(
      window.localStorage.getItem("newsekolah:draft:school-1:admin-1:counseling:new"),
    ).not.toBeNull();
    expect(cachePolicy.deleteAccountScopedCaches).toHaveBeenCalledTimes(1);
  });
});
