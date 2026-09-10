import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { LibraryReportsView } from "../../../../features/library/components/library-reports-view";

export default function LibraryReportsPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="view_library_reports">
      <LibraryReportsView />
    </RouteGuard>
  );
}
