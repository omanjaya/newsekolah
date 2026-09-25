/**
 * Typed `meta` for every `useMutation()` in this app (`@tanstack/react-query`'s
 * `Register` augmentation, https://tanstack.com/query -- `meta` is
 * otherwise a bare `Record<string, unknown>`). Read by the mutation
 * cache's default `onSuccess`/`onError` in `query-provider.tsx`:
 *
 * - `successMessage`: shown as a success toast when the mutation settles.
 *   Omit it for a mutation with no user-visible outcome of its own (a
 *   background refresh, a `PATCH` a parent screen's own toast already
 *   covers) -- the default here is silent on success, unlike the error
 *   toast below, which is opt-out rather than opt-in.
 * - `errorToast: false`: suppresses the default error toast for a mutation
 *   whose call sites already show the failure inline (a `role="alert"`
 *   message next to the field, e.g. `schedule-form.tsx`) well enough that
 *   a second, generic toast on top would just be noise. Leave it unset
 *   (the default) for everything else -- most mutations show nothing at
 *   all today, which is the bug this cache exists to close.
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
