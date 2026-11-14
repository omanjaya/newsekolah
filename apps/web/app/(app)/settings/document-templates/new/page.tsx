import type { ReactElement } from "react";

import { RouteGuard } from "../../../../../components/route-guard";
import { TemplateEditorView } from "../../../../../features/documents/components/template-editor";

export default function NewDocumentTemplatePage(): ReactElement {
  return (
    <RouteGuard requiredPermission="manage_settings">
      <TemplateEditorView />
    </RouteGuard>
  );
}
