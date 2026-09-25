/**
 * A minimal valid 1x1 transparent PNG, inlined as base64 so specs that
 * need to exercise a real file upload (leave-request evidence,
 * fixtures-data.ts's TINY_PNG) never depend on a fixture file living on
 * disk relative to some working directory -- Playwright's
 * `setInputFiles` accepts a buffer directly.
 */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
