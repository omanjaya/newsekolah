import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { BrandingView } from "../../../../features/settings/components/branding-view";

export default function BrandingPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="manage_settings">
      <BrandingView />
    </RouteGuard>
  );
}
