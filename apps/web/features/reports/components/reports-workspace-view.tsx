"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { ComponentType, ReactElement, ReactNode } from "react";

import { ForbiddenPage } from "../../../components/forbidden-page";
import { ModuleUnavailablePage } from "../../../components/module-unavailable-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { moduleSectionsAccess, navAccessFromMe } from "../../../lib/navigation-access";
import { REPORT_SECTIONS } from "../../../lib/navigation-sections";
import { useSession } from "../../../lib/session/session-provider";

interface SectionViewProps {
  tabKey?: string;
}

interface SchoolViewProps extends SectionViewProps {
  sectionNav?: ReactNode;
}

type ReportSectionKey = (typeof REPORT_SECTIONS)[number]["key"];

const SchoolReports: ComponentType<SchoolViewProps> = dynamic(() =>
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

/**
 * What each section renders. Which sections exist, and the permission and
 * module each needs, come from `REPORT_SECTIONS`, the same list the
 * navigation registry decides the menu entry and the route from: the
 * school reports call the report centre (reports), the library reports
 * call library, the visitor recap calls visitors.
 */
const SECTION_VIEWS: Record<
  ReportSectionKey,
  { label: string; View: ComponentType<SectionViewProps> }
> = {
  school: { label: "schoolReports", View: SchoolReports },
  library: { label: "libraryReports", View: LibraryReports },
  visitors: { label: "visitorReports", View: VisitorReports },
};

/**
 * Each report domain mounts only when its own grant is present and its
 * module is on; the page is reachable while at least one is.
 */
export function ReportsWorkspaceView(): ReactElement {
  const { me } = useSession();
  const t = useTranslations("app.workspace");
  const access = navAccessFromMe(me);
  const sections = REPORT_SECTIONS.filter(
    (section) => moduleSectionsAccess([section], access) === "ok",
  );
  const [section, setSection] = useUrlState<string>(
    "section",
    sections.map((entry) => entry.key),
    sections[0]?.key ?? "school",
  );
  const selected = sections.find((entry) => entry.key === section) ?? sections[0];
  if (!selected) {
    // Nothing left to show: either no grant, or every granted domain is off.
    return moduleSectionsAccess(REPORT_SECTIONS, access) === "module-disabled" ? (
      <ModuleUnavailablePage />
    ) : (
      <ForbiddenPage />
    );
  }
  const { View } = SECTION_VIEWS[selected.key];
  const tabKey = selected.key === "school" ? "tab" : `${selected.key}Tab`;
  if (sections.length <= 1) return <View tabKey={tabKey} />;
  // The section strip sits under the page title: the report centre takes
  // it into its own page header; the library and visitor views still draw
  // their own header, so for them it stays above (a handoff to those areas).
  const strip = (
    <TabsList variant="underline" aria-label={t("reports")}>
      {sections.map((entry) => (
        <TabsTrigger key={entry.key} value={entry.key}>
          {t(SECTION_VIEWS[entry.key].label)}
        </TabsTrigger>
      ))}
    </TabsList>
  );
  return (
    <Tabs value={selected.key} onValueChange={setSection}>
      {selected.key !== "school" && <div className="px-4 pt-4 md:px-6">{strip}</div>}
      {/* The section view is the panel of whichever section tab is active. */}
      <TabsContent value={selected.key}>
        {selected.key === "school" ? (
          <SchoolReports tabKey={tabKey} sectionNav={strip} />
        ) : (
          <View tabKey={tabKey} />
        )}
      </TabsContent>
    </Tabs>
  );
}
