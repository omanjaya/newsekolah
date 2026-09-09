/**
 * NEXT_PUBLIC_API_URL is inlined at build time and read from both the
 * browser and route handlers (manifest, healthz). It must resolve to an
 * origin the browser itself can reach: the access token lives in memory
 * only, so `credentials: "include"` calls go straight from the browser to
 * this origin, never through a Next.js server proxy.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

if (!API_URL && typeof window !== "undefined") {
  console.error(
    "NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env.local and point it at the API origin.",
  );
}

/**
 * Server-side API origin. Defaults to the public URL; override it when the
 * server reaches the API through an internal network (Docker service name)
 * or when the public URL points back at this app (e2e mocks).
 */
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? API_URL;
