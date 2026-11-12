"use client";

import { Tabs, TabsList, TabsTrigger } from "@newsekolah/ui";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { ComponentType, ReactElement } from "react";

import { ForbiddenPage } from "../../../components/forbidden-page";
import { ModuleUnavailablePage } from "../../../components/module-unavailable-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { isModuleEnabled, type FeatureModule } from "../../../lib/modules/feature-modules";
import { useSession } from "../../../lib/session/session-provider";

interface SectionViewProps {
  tabKey?: string;
}

const SchoolReports: ComponentType<SectionViewProps> = dynamic(() =>
  import("./reports-view").then((module) => module.ReportsView),
);
const LibraryReports: ComponentType<SectionViewProps> = dynamic(() =>
  import("../../library/components/library-reports-view").then(
    (module) => module.LibraryReportsView,
  ),
);
const VisitorReports: ComponentType<SectionViewProps> = dynamic(() =>
  import("../../visitors/components/visitor-recap-view").then((module) => module.VisitorRecapView),
);

const SECTIONS: {
  key: string;
  label: string;
  permission: string;
  /** The feature module whose data the section reads; the section goes away with it. */
  module: FeatureModule;
  View: ComponentType<SectionViewProps>;
}[] = [
  {
    key: "school",
    label: "schoolReports",
    permission: "view_reports",
    module: "reports",
    View: SchoolReports,
  },
  {
    key: "library",
    label: "libraryReports",
    permission: "view_library_reports",
    module: "library",
    View: LibraryReports,
  },
  {
    key: "visitors",
    label: "visitorReports",
    permission: "view_visitor_reports",
    module: "visitors",
    View: VisitorReports,
  },
];

/** Each report domain mounts only when its own grant is present. */
export function ReportsWorkspaceView(): ReactElement {
  const { me } = useSession();
  const t = useTranslations("app.workspace");
  const sections = SECTIONS.filter(
    (section) =>
      me?.permissions.includes(section.permission) && isModuleEnabled(me, section.module),
  );
  const [section, setSection] = useUrlState(
    "section",
    sections.map((entry) => entry.key),
    sections[0]?.key ?? "school",
  );
  const selected = sections.find((entry) => entry.key === section) ?? sections[0];
  if (!selected) {
    // Nothing left to show: either no grant, or every granted domain is off.
    const grantedButOff = SECTIONS.some((section) => me?.permissions.includes(section.permission));
    return grantedButOff ? <ModuleUnavailablePage /> : <ForbiddenPage />;
  }
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
