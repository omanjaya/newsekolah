/**
 * Route-level fallback outside the app shell, while a route group's layout
 * loads: the school's mark and name, full screen (BrandedLoading). The
 * shell has its own page-shaped fallback in (app)/loading.tsx. It stays a
 * Server Component; BrandedLoading is the client part.
 */
import type { ReactElement } from "react";

import { BrandedLoading } from "../components/branded-loading";

export default function Loading(): ReactElement {
  return <BrandedLoading />;
}
