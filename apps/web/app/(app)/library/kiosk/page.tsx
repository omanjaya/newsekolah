import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { KioskView } from "../../../../features/library/components/kiosk-view";

export default function LibraryKioskPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="manage_library_circulation">
      <KioskView />
    </RouteGuard>
  );
}
