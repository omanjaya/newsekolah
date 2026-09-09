"use client";

import type { ReactElement, ReactNode } from "react";

import { AppShell } from "../../components/app-shell";
import { RouteGuard } from "../../components/route-guard";

export default function AppLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <RouteGuard>
      <AppShell>{children}</AppShell>
    </RouteGuard>
  );
}
