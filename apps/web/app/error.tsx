"use client";

import type { ReactElement } from "react";

import { PublicSiteFrame } from "../components/public-site-frame";
import { RenderErrorState } from "../components/render-error-state";

/**
 * The last boundary under the root layout, so it stands in for whatever
 * threw, the app shell included: the error state in the school's frame.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactElement {
  return (
    <PublicSiteFrame>
      <RenderErrorState error={error} reset={reset} />
    </PublicSiteFrame>
  );
}
