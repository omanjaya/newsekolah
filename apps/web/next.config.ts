import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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
  cacheOnNavigation: true,
  reloadOnOnline: true,
  // Per-route app chunks change on every deploy and are only ever needed for
  // the route the visitor is already on (fetched normally, no offline value
  // from precaching every other route's chunk). The shared app shell, CSS,
  // and offline page keep being precached as before.
  exclude: [/\/chunks\/app\//],
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
