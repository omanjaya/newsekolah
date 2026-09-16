import type { ReactElement } from "react";

import { RouteGuard } from "../../../../../components/route-guard";
import { UserImportView } from "../../../../../features/school/components/user-import-view";

export default function UserImportPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="create_users">
      <UserImportView />
    </RouteGuard>
  );
}
