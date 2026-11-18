import { describe, expect, it } from "vitest";

import { isExcludedFromPrecache, isOfflineDocumentChunk } from "./precache-exclude";

// Asset names as the last production build emitted them.
const OFFLINE_DOCUMENT_CHUNKS = [
  "static/chunks/app/layout-7111838f56bf2205.js",
  "static/chunks/app/error-4a04de95b786a84f.js",
  "static/chunks/app/global-error-66a7809ac27f0e6c.js",
  "static/chunks/app/not-found-9f0bcc3ace2fef63.js",
  "static/chunks/app/loading-a09ea098470d38ea.js",
  "static/chunks/app/(public)/layout-40d2e7bf2d020fb7.js",
  "static/chunks/app/(public)/offline/page-0e1d7ff6bec9a734.js",
];

const OTHER_ROUTE_CHUNKS = [
  "static/chunks/app/page-897a4ec8368b15f4.js",
  "static/chunks/app/(app)/layout-0a1b2c3d4e5f6a7b.js",
  "static/chunks/app/(app)/dashboard/page-0a1b2c3d4e5f6a7b.js",
  "static/chunks/app/(app)/discipline/counseling/[id]/page-0a1b2c3d4e5f6a7b.js",
  "static/chunks/app/(auth)/login/page-0a1b2c3d4e5f6a7b.js",
  "static/chunks/app/(public)/opac/page-0a1b2c3d4e5f6a7b.js",
  "static/chunks/app/(public)/verify/page-0a1b2c3d4e5f6a7b.js",
  "static/chunks/app/_not-found/page-0a1b2c3d4e5f6a7b.js",
  "static/chunks/app/(public)/offline/layout-0a1b2c3d4e5f6a7b.js.map",
];

const SHARED_ASSETS = [
  "static/chunks/main-app-0a1b2c3d4e5f6a7b.js",
  "static/chunks/webpack-0a1b2c3d4e5f6a7b.js",
  "static/chunks/4bd1b696-0a1b2c3d4e5f6a7b.js",
  "static/css/0a1b2c3d4e5f6a7b.css",
  "static/media/manrope-latin.0a1b2c3d.woff2",
];

describe("isOfflineDocumentChunk", () => {
  it.each(OFFLINE_DOCUMENT_CHUNKS)("recognises %s", (name) => {
    expect(isOfflineDocumentChunk(name)).toBe(true);
  });

  it.each(OTHER_ROUTE_CHUNKS)("does not recognise %s", (name) => {
    expect(isOfflineDocumentChunk(name)).toBe(false);
  });
});

describe("isExcludedFromPrecache", () => {
  it.each(OTHER_ROUTE_CHUNKS)("keeps the route chunk %s out", (name) => {
    expect(isExcludedFromPrecache(name)).toBe(true);
  });

  it.each(OFFLINE_DOCUMENT_CHUNKS)("precaches the offline page's chunk %s", (name) => {
    expect(isExcludedFromPrecache(name)).toBe(false);
  });

  it.each(SHARED_ASSETS)("precaches the shared asset %s", (name) => {
    expect(isExcludedFromPrecache(name)).toBe(false);
  });
});
