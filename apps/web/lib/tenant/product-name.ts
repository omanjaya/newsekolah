/**
 * The platform's own name, shown only while a school's branding is
 * unknown. Its own module, without "use client", so server code (the root
 * layout's metadata, route handlers) gets the string itself: imported from
 * the client tenant provider, a server module receives a client reference
 * instead, which is not a string.
 */
export const PRODUCT_NAME_FALLBACK = "SION";
