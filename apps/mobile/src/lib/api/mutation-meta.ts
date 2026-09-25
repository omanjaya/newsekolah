/**
 * Mirrors apps/web/lib/query/mutation-meta.ts -- same shape, read by this
 * app's own mutation cache (mutation-cache.ts) instead of web's. See that
 * file's doc comment for what each field means; kept as a separate
 * declaration (rather than importing web's) because `declare module`
 * augmentations apply per compiled program, and web and mobile are two
 * separate TypeScript programs.
 */
declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      successMessage?: string;
      errorToast?: false;
    };
  }
}

export {};
