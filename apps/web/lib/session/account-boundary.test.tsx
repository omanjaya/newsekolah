import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readDraft, writeDraft } from "../drafts/draft-storage";

import { AccountBoundary } from "./account-boundary";

const session = vi.hoisted((): { value: { me: unknown; isReady: boolean } } => ({
  value: { me: undefined, isReady: false },
}));
const cachePolicy = vi.hoisted(() => ({
  deleteAccountScopedCaches: vi.fn(() => Promise.resolve([] as string[])),
}));

vi.mock("./session-provider", () => ({ useSession: () => session.value }));
vi.mock("../pwa/cache-policy", () => cachePolicy);

const LEGACY_KEYS = [
  "newsekolah:attendance-draft:session-1",
  "newsekolah:counseling-draft:new",
  "newsekolah:journal-draft:class-1:subject-1:2026-09-21",
  "newsekolah:gradebook-draft:class-1:subject-1:term-1",
  "newsekolah:supervision-observation-draft:scheduled-1",
];

function signedIn(userId: string) {
  return { me: { id: userId, tenant: { tenant_id: "school-1" } }, isReady: true };
}

beforeEach(() => {
  window.localStorage.clear();
  cachePolicy.deleteAccountScopedCaches.mockClear();
  session.value = { me: undefined, isReady: false };
});

describe("AccountBoundary", () => {
  it("deletes legacy drafts on mount and keeps drafts that have an owner", () => {
    for (const key of LEGACY_KEYS) window.localStorage.setItem(key, "{}");
    writeDraft("school-1:user-a", "counseling", "new", { text: "a" });

    render(<AccountBoundary />);

    for (const key of LEGACY_KEYS) expect(window.localStorage.getItem(key)).toBeNull();
    expect(readDraft("school-1:user-a", "counseling", "new")).not.toBeNull();
  });

  it("deletes account caches once the session settles and again for a different account", () => {
    writeDraft("school-1:user-a", "counseling", "new", { text: "a" });
    const { rerender } = render(<AccountBoundary />);
    expect(cachePolicy.deleteAccountScopedCaches).not.toHaveBeenCalled();

    session.value = signedIn("user-a");
    rerender(<AccountBoundary />);
    expect(cachePolicy.deleteAccountScopedCaches).toHaveBeenCalledTimes(1);

    session.value = signedIn("user-a");
    rerender(<AccountBoundary />);
    expect(cachePolicy.deleteAccountScopedCaches).toHaveBeenCalledTimes(1);

    session.value = signedIn("user-b");
    rerender(<AccountBoundary />);
    expect(cachePolicy.deleteAccountScopedCaches).toHaveBeenCalledTimes(2);

    // A change of account never takes the previous account's drafts with it.
    expect(readDraft("school-1:user-a", "counseling", "new")).not.toBeNull();
  });
});
