import type { ReactElement } from "react";

import { AcademicWorkspaceLinks } from "../../../../features/academic/components/academic-workspace-links";
import { RolesView } from "../../../../features/roles/components/roles-view";

export default function RolesPage(): ReactElement {
  return (
    <>
      <div className="px-4 pt-4 md:px-6 md:pt-6">
        <AcademicWorkspaceLinks area="users" />
      </div>
      <RolesView />
    </>
  );
}
