import { SkeletonList } from "@newsekolah/ui";
import { Suspense } from "react";
import type { ReactElement } from "react";

import { SchoolStructureView } from "../../../../features/academic/components/school-structure-view";

export default function Page(): ReactElement {
  return (
    <Suspense fallback={<SkeletonList rows={6} framed className="m-4 md:m-6" />}>
      <SchoolStructureView />
    </Suspense>
  );
}
