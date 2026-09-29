"use client";

import { Button } from "@newsekolah/ui";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";

import { DashboardView } from "./dashboard-view";

const LibraryDashboard = dynamic(() =>
  import("../../library/components/library-dashboard-view").then(
    (module) => module.LibraryDashboardView,
  ),
);

/** Personal data and work queues share the home destination, without duplicate sidebar entries. */
export function HomeWorkspaceView(): ReactElement {
  const { me } = useSession();
  const t = useTranslations("app.workspace");
  const can = (permission: string) => me?.permissions.includes(permission) ?? false;
  const libraryHome =
    can("view_library") &&
    can("manage_library_circulation") &&
    !can("manage_master_data") &&
    !can("manage_attendance");
  const actions = [
    ...(me?.profile_kind === "student" ? [{ href: "/classroom-entry", label: "scanClass" }] : []),
    ...(["teacher", "staff"].includes(me?.profile_kind ?? "")
      ? [{ href: "/check-in", label: "checkIn" }]
      : []),
    ...(can("view_monitor_presence") ? [{ href: "/monitor", label: "openMonitor" }] : []),
    ...(can("manage_settings") ? [{ href: "/setup", label: "setup" }] : []),
    ...(!libraryHome && can("view_library")
      ? [{ href: "/library", label: "libraryOverview" }]
      : []),
  ];
  return (
    <>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-4 md:px-6">
          {actions.map((action) => (
            <Button key={action.href} asChild variant="secondary" size="sm">
              <Link href={action.href}>{t(action.label)}</Link>
            </Button>
          ))}
        </div>
      )}
      {libraryHome ? <LibraryDashboard /> : <DashboardView />}
    </>
  );
}
