import type { ReactElement } from "react";

/**
 * A page-shaped placeholder: the header (eyebrow and title), a row of
 * three summary cards and the main card, on the page template's default
 * width and gutters, with the cards' 20px radius, so the page it stands in
 * for replaces it without a jump.
 *
 * Plain markup with the `skeleton` utility (styles.css), not the
 * `@newsekolah/ui` barrel: `app/loading.tsx` stays a Server Component, and
 * the barrel re-exports client-only components without their own
 * "use client" directives.
 */
export function PageSkeleton({ label }: { label?: string }): ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto flex w-full max-w-default flex-col gap-6 px-4 py-6 md:px-6 md:py-8"
    >
      {label && <span className="sr-only">{label}</span>}
      <div className="flex flex-col gap-3">
        <div className="skeleton h-3.5 w-28 rounded-full" />
        <div className="skeleton h-7 w-64 max-w-full rounded-full md:h-8" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="skeleton h-24 rounded-lg" />
        <div className="skeleton hidden h-24 rounded-lg sm:block" />
        <div className="skeleton hidden h-24 rounded-lg sm:block" />
      </div>
      <div className="skeleton h-72 rounded-lg" />
    </div>
  );
}
