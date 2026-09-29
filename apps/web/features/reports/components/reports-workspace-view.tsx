"use client";

import { Tabs, TabsList, TabsTrigger } from "@newsekolah/ui";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { ForbiddenPage } from "../../../components/forbidden-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useSession } from "../../../lib/session/session-provider";

const SchoolReports = dynamic(() => import("./reports-view").then((module) => module.ReportsView));
const LibraryReports = dynamic(() =>
  import("../../library/components/library-reports-view").then(
    (module) => module.LibraryReportsView,
  ),
);
const VisitorReports = dynamic(() =>
  import("../../visitors/components/visitor-recap-view").then((module) => module.VisitorRecapView),
);

const SECTIONS = [
  { key: "school", label: "schoolReports", permission: "view_reports", View: SchoolReports },
  {
    key: "library",
    label: "libraryReports",
    permission: "view_library_reports",
    View: LibraryReports,
  },
  {
    key: "visitors",
    label: "visitorReports",
    permission: "view_visitor_reports",
    View: VisitorReports,
  },
];

/** Each report domain mounts only when its own grant is present. */
export function ReportsWorkspaceView(): ReactElement {
  const { me } = useSession();
  const t = useTranslations("app.workspace");
  const sections = SECTIONS.filter((section) => me?.permissions.includes(section.permission));
  const [section, setSection] = useUrlState(
    "section",
    sections.map((entry) => entry.key),
    sections[0]?.key ?? "school",
  );
  const selected = sections.find((entry) => entry.key === section) ?? sections[0];
  if (!selected) return <ForbiddenPage />;
  const View = selected.View;
  return (
    <>
      {sections.length > 1 && (
        <div className="px-4 pt-4 md:px-6">
          <Tabs value={selected.key} onValueChange={setSection}>
            <TabsList aria-label={t("reports")} className="flex-wrap">
              {sections.map((entry) => (
                <TabsTrigger key={entry.key} value={entry.key}>
                  {t(entry.label)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}
      <View tabKey={selected.key === "school" ? "tab" : `${selected.key}Tab`} />
    </>
  );
}
