import type { ReactElement, ReactNode } from "react";

import { PublicSiteFrame } from "../../components/public-site-frame";

/** Every public page (catalogue, document check, offline) inside the school's branded frame. */
export default function PublicLayout({ children }: { children: ReactNode }): ReactElement {
  return <PublicSiteFrame>{children}</PublicSiteFrame>;
}
