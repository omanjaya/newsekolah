import type { ReactElement } from "react";
import { Suspense } from "react";

import { OpacGate } from "../../../features/library/components/opac-gate";
import { OpacView } from "../../../features/library/components/opac-view";

export default function Page(): ReactElement {
  return (
    <OpacGate>
      {/* OpacView keeps its search in the address via useSearchParams, which needs a Suspense boundary. */}
      <Suspense>
        <OpacView />
      </Suspense>
    </OpacGate>
  );
}
