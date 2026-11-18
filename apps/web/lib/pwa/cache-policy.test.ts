import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LEGACY_RUNTIME_CACHE_NAMES,
  STATIC_ASSET_CACHE_NAME,
  deleteAccountScopedCaches,
  isAccountNeutralCache,
} from "./cache-policy";

const PRECACHE_NAME = "serwist-precache-v2-https://sekolah.example/";

// Every cache an older worker (Serwist's defaultCache, cacheOnNavigation)
// could have left on a shared computer.
const LEGACY_CACHE_NAMES = [
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "others",
  "cross-origin",
  "apis",
  "next-data",
  "start-url",
  "next-static-js-assets",
  "next-image",
  "static-js-assets",
  "static-style-assets",
  "static-image-assets",
  "static-font-assets",
  "static-data-assets",
  "serwist-runtime-https://sekolah.example/",
];

function fakeStore(names: string[]): {
  store: { keys: () => Promise<string[]>; delete: (name: string) => Promise<boolean> };
  deleted: string[];
} {
  const deleted: string[] = [];
  return {
    deleted,
    store: {
      keys: () => Promise.resolve([...names]),
      delete: (name: string) => {
        deleted.push(name);
        return Promise.resolve(true);
      },
    },
  };
}

describe("isAccountNeutralCache", () => {
  it.each([STATIC_ASSET_CACHE_NAME, PRECACHE_NAME])("keeps %s", (name) => {
    expect(isAccountNeutralCache(name)).toBe(true);
  });

  it.each(LEGACY_CACHE_NAMES)("rejects %s", (name) => {
    expect(isAccountNeutralCache(name)).toBe(false);
  });

  it.each(LEGACY_RUNTIME_CACHE_NAMES)("rejects the old runtime cache %s", (name) => {
    expect(isAccountNeutralCache(name)).toBe(false);
  });
});

describe("deleteAccountScopedCaches", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes exactly the caches that are not account-neutral and returns their names", async () => {
    const { store, deleted } = fakeStore([
      STATIC_ASSET_CACHE_NAME,
      "pages",
      PRECACHE_NAME,
      "others",
      "apis",
    ]);

    await expect(deleteAccountScopedCaches(store)).resolves.toEqual(["pages", "others", "apis"]);
    expect(deleted).toEqual(["pages", "others", "apis"]);
  });

  it("deletes nothing when only account-neutral caches exist", async () => {
    const { store, deleted } = fakeStore([STATIC_ASSET_CACHE_NAME, PRECACHE_NAME]);

    await expect(deleteAccountScopedCaches(store)).resolves.toEqual([]);
    expect(deleted).toEqual([]);
  });

  it("resolves to an empty list when the cache names cannot be read", async () => {
    const store = {
      keys: () => Promise.reject(new Error("SecurityError")),
      delete: () => Promise.resolve(true),
    };

    await expect(deleteAccountScopedCaches(store)).resolves.toEqual([]);
  });

  it("resolves to an empty list when there is no Cache Storage at all", async () => {
    vi.stubGlobal("caches", undefined);

    await expect(deleteAccountScopedCaches()).resolves.toEqual([]);
  });
});
