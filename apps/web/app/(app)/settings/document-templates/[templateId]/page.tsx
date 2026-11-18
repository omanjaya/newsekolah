import type { ReactElement } from "react";

import { RouteGuard } from "../../../../../components/route-guard";
import { TemplateEditorView } from "../../../../../features/documents/components/template-editor";

export default async function DocumentTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}): Promise<ReactElement> {
  const { templateId } = await params;
  return (
    <RouteGuard requiredPermission="manage_settings">
      <TemplateEditorView templateId={templateId} />
    </RouteGuard>
  );
}
