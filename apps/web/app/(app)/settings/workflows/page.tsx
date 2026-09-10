import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { WorkflowDefinitionsView } from "../../../../features/workflows/components/workflow-definitions-view";

export default function WorkflowsPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="manage_workflows">
      <WorkflowDefinitionsView />
    </RouteGuard>
  );
}
