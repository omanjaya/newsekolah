import { SkeletonList } from "@newsekolah/ui";
import { Suspense } from "react";
import type { ReactElement } from "react";

import { AssignmentsView } from "../../../../features/academic/components/assignments-view";

export default function Page(): ReactElement {
  return (
    <Suspense fallback={<SkeletonList rows={6} framed className="m-4 md:m-6" />}>
      <AssignmentsView />
    </Suspense>
  );
}
