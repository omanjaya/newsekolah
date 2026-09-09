/**
 * Route-level fallback while a segment's data is loading. Shaped like page
 * content (header line, three body blocks) rather than a spinner, per
 * DESIGN.md's "skeleton berkilau lebih dari 1 detik" limit — this is meant
 * to be replaced by real content within a second, not to be stared at.
 *
 * Plain markup (not `@newsekolah/ui`'s `Skeleton`) so this stays a Server
 * Component: `@newsekolah/ui`'s barrel re-exports client-only components
 * (DataTable, Form, ...) without their own "use client" directives, so
 * importing anything from it here would force the whole route into the
 * client bundle just to render four static divs.
 */
import type { ReactElement } from "react";

export default function Loading(): ReactElement {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="h-8 w-48 animate-pulse rounded-xs bg-border/60" />
      <div className="flex flex-col gap-3">
        <div className="h-24 w-full animate-pulse rounded-xs bg-border/60" />
        <div className="h-24 w-full animate-pulse rounded-xs bg-border/60" />
        <div className="h-24 w-full animate-pulse rounded-xs bg-border/60" />
      </div>
    </div>
  );
}
