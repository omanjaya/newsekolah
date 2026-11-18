import { randomUUID } from "node:crypto";

import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { isExcludedFromPrecache } from "./lib/pwa/precache-exclude";

/**
 * Next vendors webpack internally rather than depending on the public
 * `webpack` package, so `NextConfig["webpack"]`'s own config parameter type
 * resolves to `any` here (nothing to resolve `webpack.Configuration`
 * against). This is the minimal shape the extensionAlias tweak below
 * actually touches, typed explicitly instead of accepting that `any`.
 */
interface WebpackConfigLike {
  resolve?: {
    extensionAlias?: Record<string, string[]>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Off: it has the page fetch every client-side navigation with the
  // signed-in cookies and store the HTML in Cache Storage by URL, where it
  // was served to whoever used the computer next (lib/pwa/cache-policy.ts).
  cacheOnNavigation: false,
  reloadOnOnline: true,
  // The offline page the worker falls back to must be in the precache, or
  // the fallback finds nothing. Its HTML names this build's chunk hashes, so
  // the revision changes on every build and each new worker fetches it
  // again. Setting this replaces Serwist's default of precaching every file
  // in public/, which holds only the generated worker today.
  additionalPrecacheEntries: [{ url: "/offline", revision: randomUUID() }],
  // Per-route chunks stay out of the precache, except the ones the offline
  // page loads (lib/pwa/precache-exclude.ts). Serwist calls a function
  // condition with the webpack asset; the parameter is typed here because
  // webpack's own types do not resolve from this package.
  exclude: [({ asset }: { asset: { name: string } }) => isExcludedFromPrecache(asset.name)],
  // Keeps oversized on-demand chunks out of the precache no matter what
  // webpack names them: the exceljs vendor chunk (~912 kB raw, import
  // screens only, docs/16-audit-performa-web.md item 9) gets a hashed id
  // that no name-based exclude can target. Every precached chunk today is
  // well under this bound.
  maximumFileSizeToCacheInBytes: 700 * 1024,
});

const nextConfig: NextConfig = {
  // Standalone output is only needed for the container image; `next start`
  // (used by e2e) does not support it.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  // Pages merged into tabbed screens keep their old URLs working. These
  // were page-level redirect() calls, which run after the (app) shell and
  // its loading boundary have streamed, so the browser performed them and
  // the dev router crashed with "Rendered more hooks than during the
  // previous render". An HTTP redirect happens before anything renders.
  redirects() {
    const moved: [source: string, destination: string][] = [
      ["/academic/grade-levels", "/school/structure?tab=grade-levels"],
      ["/academic/rooms", "/school/structure?tab=rooms"],
      ["/academic/tracks", "/school/structure?tab=tracks"],
      ["/academic/subject-offerings", "/school/learning?tab=offerings"],
      ["/academic/teaching-assignments", "/school/assignments?tab=teaching"],
      ["/school/duties", "/school/assignments?tab=duties"],
      ["/school/subjects", "/school/learning?tab=subjects"],
      ["/school/periods", "/school/learning?tab=periods"],
    ];
    return Promise.resolve(
      moved.map(([source, destination]) => ({ source, destination, permanent: false })),
    );
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // packages/ui is a barrel (docs/16-audit-performa-web.md item 8): without
    // this, importing one component from it drags in every route that used
    // to eagerly load qrcode.react, @tanstack/react-table, cmdk, and sonner,
    // even on routes (like /login) that use none of them.
    optimizePackageImports: ["@newsekolah/ui"],
  },
  // next/image is not used anywhere in this app (every tenant-supplied
  // image is rendered with a plain <img>, per the comment in
  // components/tenant-brand.tsx), so there is no optimizer to configure a
  // remote allow-list for. The previous `images.remotePatterns` allowed
  // any HTTPS host, which is not a real restriction and had no effect
  // here besides suggesting next/image is used to render remote images.
  webpack: (config: WebpackConfigLike) => {
    // @newsekolah/ui and @newsekolah/ui-tokens ship as TypeScript source
    // (package.json `exports` points at `./src/index.ts`) and internally
    // import each other with a `.js` extension, per TypeScript's own
    // "moduleResolution: bundler" convention for ESM source. Webpack (unlike
    // Vite, which packages/ui's own tests and Storybook use) does not resolve
    // that `.js` suffix back to the real `.ts`/`.tsx` file without this.
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default withNextIntl(withSerwist(nextConfig));
