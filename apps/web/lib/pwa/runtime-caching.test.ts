import { CacheFirst, NetworkOnly, Strategy } from "serwist";
import { describe, expect, it } from "vitest";

import { STATIC_ASSET_CACHE_NAME } from "./cache-policy";
import type { RuntimeRule } from "./runtime-caching";
import { buildRuntimeCaching, isNavigationRequest, isStaticBuildAsset } from "./runtime-caching";

const ORIGIN = "https://sekolah.example";

interface SampleRequest {
  url: string;
  method?: string;
  mode?: RequestMode;
  headers?: Record<string, string>;
}

/**
 * Resolves a request the way Serwist's router does: only the rules
 * registered for the request's method are tried, in order, and the first
 * matcher that returns something truthy wins. `undefined` means the worker
 * does not answer and the browser fetches as if it were not there.
 */
function resolve(rules: RuntimeRule[], sample: SampleRequest): RuntimeRule["handler"] | undefined {
  const url = new URL(sample.url, ORIGIN);
  const request = {
    method: sample.method ?? "GET",
    mode: sample.mode ?? "cors",
    headers: new Headers(sample.headers),
  };
  const sameOrigin = url.origin === ORIGIN;
  for (const rule of rules) {
    if ((rule.method ?? "GET") !== request.method) continue;
    if (rule.matcher({ url, sameOrigin, request })) return rule.handler;
  }
  return undefined;
}

function resolveSample(sample: SampleRequest): RuntimeRule["handler"] | undefined {
  return resolve(buildRuntimeCaching(), sample);
}

const LEGACY_CACHE_NAMES = [
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "others",
  "cross-origin",
  "apis",
  "next-data",
  "start-url",
];

describe("buildRuntimeCaching", () => {
  it("sends a navigation into a signed-in page to the network only", () => {
    const handler = resolveSample({ url: "/discipline/counseling/abc", mode: "navigate" });

    expect(handler).toBeInstanceOf(NetworkOnly);
  });

  it.each<[string, SampleRequest]>([
    [
      "an API call with a bearer token",
      { url: "/v1/me", headers: { Authorization: "Bearer token-of-account-a" } },
    ],
    ["an API file download", { url: "/v1/files/photo.png" }],
    ["an RSC payload", { url: "/discipline/counseling/abc?_rsc=x", headers: { RSC: "1" } }],
    [
      "an RSC prefetch",
      { url: "/dashboard?_rsc=y", headers: { RSC: "1", "Next-Router-Prefetch": "1" } },
    ],
    [
      "a same-origin presigned object URL",
      {
        url: "/storage/newsekolah/students/abc.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef",
        mode: "no-cors",
      },
    ],
    ["a request to another origin", { url: "https://api.other.example/v1/me" }],
    ["a route handler", { url: "/api/healthz" }],
    ["the web app manifest", { url: "/manifest.webmanifest" }],
    ["the branding icon", { url: "/branding-icon", mode: "no-cors" }],
    ["a page posted by a form", { url: "/login", method: "POST", mode: "navigate" }],
  ])("does not answer %s", (_label, sample) => {
    expect(resolveSample(sample)).toBeUndefined();
  });

  it.each([
    "/_next/static/chunks/app/(app)/page-abc.js",
    "/_next/static/css/0a1b2c3d4e5f.css",
    "/_next/static/media/manrope-latin.0a1b2c3d.woff2",
  ])("serves the build file %s from the static asset cache", (path) => {
    const handler = resolveSample({ url: path, mode: "no-cors" });

    expect(handler).toBeInstanceOf(CacheFirst);
    expect(handler instanceof CacheFirst ? handler.cacheName : undefined).toBe(
      "next-static-assets",
    );
  });

  it("does not answer a build file path on another origin", () => {
    const handler = resolveSample({
      url: "https://cdn.other.example/_next/static/chunks/main-abc.js",
      mode: "no-cors",
    });

    expect(handler).toBeUndefined();
  });

  it("has exactly two rules and writes to no cache but the static asset cache", () => {
    const rules = buildRuntimeCaching();
    const strategies = rules.map(({ handler }) => handler);
    // NetworkOnly carries Serwist's default cache name but never opens a
    // cache, so only the other strategies count as writers.
    const writtenCaches = strategies
      .filter((handler) => !(handler instanceof NetworkOnly))
      .map((handler) => (handler instanceof Strategy ? handler.cacheName : "not a strategy"));
    const everyCacheName = strategies.map((handler) =>
      handler instanceof Strategy ? handler.cacheName : "not a strategy",
    );

    expect(rules).toHaveLength(2);
    expect(writtenCaches).toEqual([STATIC_ASSET_CACHE_NAME]);
    for (const legacy of LEGACY_CACHE_NAMES) {
      expect(everyCacheName).not.toContain(legacy);
    }
  });

  it("returns new strategy instances on every call", () => {
    const [first] = buildRuntimeCaching();
    const [second] = buildRuntimeCaching();

    expect(first?.handler).not.toBe(second?.handler);
  });
});

describe("route matchers", () => {
  const url = new URL("/_next/static/chunks/main-abc.js", ORIGIN);

  it("treats only navigate mode as a navigation", () => {
    expect(isNavigationRequest({ url, sameOrigin: true, request: { mode: "navigate" } })).toBe(
      true,
    );
    expect(isNavigationRequest({ url, sameOrigin: true, request: { mode: "cors" } })).toBe(false);
  });

  it("requires the same origin for build files", () => {
    expect(isStaticBuildAsset({ url, sameOrigin: true, request: { mode: "no-cors" } })).toBe(true);
    expect(isStaticBuildAsset({ url, sameOrigin: false, request: { mode: "no-cors" } })).toBe(
      false,
    );
  });
});
