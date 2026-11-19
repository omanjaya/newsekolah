import type { Metadata } from "next";
import type { ReactNode } from "react";

import { pageTitleMetadata } from "../../../lib/i18n/page-metadata";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleMetadata("app.offlinePage", "title");
}

export default function OfflineLayout({ children }: { children: ReactNode }): ReactNode {
  return children;
}
