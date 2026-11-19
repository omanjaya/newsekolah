import type { Metadata } from "next";
import type { ReactNode } from "react";

import { pageTitleMetadata } from "../../../lib/i18n/page-metadata";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleMetadata("app.account.resetPassword", "title");
}

export default function ResetPasswordLayout({ children }: { children: ReactNode }): ReactNode {
  return children;
}
