import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeDraft } from "../drafts/draft-storage";

import { forgetAccountOnThisBrowser } from "./forget-account";

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
