import type { ReactElement } from "react";

import { PermitsWorkspaceView } from "../../../features/permits/components/permits-workspace-view";

export default function Page(): ReactElement {
  return <PermitsWorkspaceView initialType="exit" />;
}
