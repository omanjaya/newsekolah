import { Suspense } from "react";
import type { ReactElement } from "react";

import { ReportsWorkspaceView } from "../../../features/reports/components/reports-workspace-view";

export default function Page(): ReactElement {
  return (
    <Suspense>
      <ReportsWorkspaceView />
    </Suspense>
  );
}
