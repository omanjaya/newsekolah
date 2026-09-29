import type { ReactElement, ReactNode } from "react";

import { SettingsWorkspace } from "../../../features/settings/components/settings-workspace";

export default function SettingsLayout({ children }: { children: ReactNode }): ReactElement {
  return <SettingsWorkspace>{children}</SettingsWorkspace>;
}
