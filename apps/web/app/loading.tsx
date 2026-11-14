/**
 * Route-level fallback while a segment's data is loading: the page's shape
 * (see PageSkeleton), not a spinner, per docs/07 section 5 (skeleton up to
 * a second, then an indicator). It stays a Server Component.
 */
import type { ReactElement } from "react";

import { PageSkeleton } from "../components/page-skeleton";

export default function Loading(): ReactElement {
  return <PageSkeleton />;
}
