import { Suspense } from "react";
import type { ReactElement } from "react";

import { SchoolStructureView } from "../../../../features/academic/components/school-structure-view";

export default function Page(): ReactElement {
  return (
    <Suspense
      fallback={<div aria-busy="true" className="m-6 h-64 animate-pulse rounded-sm bg-surface" />}
    >
      <SchoolStructureView />
    </Suspense>
  );
}
