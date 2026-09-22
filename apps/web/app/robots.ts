import type { MetadataRoute } from "next";

import { ALLOW_INDEXING } from "../lib/env";

/**
 * The rebuild is still in its test period (docs/15-paritas-sion.md): every
 * deployment stays out of search engines until `NEXT_PUBLIC_ALLOW_INDEXING`
 * is explicitly set to "true" (see lib/env.ts). `app/layout.tsx`'s
 * `robots` metadata carries the matching per-page noindex directive.
 */
export default function robots(): MetadataRoute.Robots {
  if (ALLOW_INDEXING) {
    return { rules: { userAgent: "*", allow: "/" } };
  }
  return { rules: { userAgent: "*", disallow: "/" } };
}
