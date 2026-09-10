import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { SupervisionCyclesView } from "../../../../features/supervision/components/supervision-cycles-view";

export default function SupervisionCyclesPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="view_supervision">
      <SupervisionCyclesView />
    </RouteGuard>
  );
}
