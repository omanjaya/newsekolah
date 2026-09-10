import type { ReactElement } from "react";

import { RouteGuard } from "../../../../components/route-guard";
import { DocumentTemplatesView } from "../../../../features/documents/components/document-templates-view";

export default function DocumentTemplatesPage(): ReactElement {
  return (
    <RouteGuard requiredPermission="manage_settings">
      <DocumentTemplatesView />
    </RouteGuard>
  );
}
