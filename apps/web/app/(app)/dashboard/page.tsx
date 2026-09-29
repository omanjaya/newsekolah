import { Suspense } from "react";
import type { ReactElement } from "react";

import { HomeWorkspaceView } from "../../../features/dashboard/components/home-workspace-view";

export default function Page(): ReactElement {
  return (
    <Suspense>
      <HomeWorkspaceView />
    </Suspense>
  );
}
