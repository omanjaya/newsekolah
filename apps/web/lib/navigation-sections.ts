import type { FeatureModule } from "./modules/feature-modules";
import type { NavModuleSection } from "./navigation-access";

/**
 * The parts of pages that mix feature modules (`NavItem.moduleSections`),
 * shared by the registry and the pages themselves so the menu and the page
 * never disagree about what is usable. Each part's module is the one whose
 * endpoints it calls.
 */

/** The reports workspace: the report centre, library reports, visitor recap. */
export const REPORT_SECTIONS = [
  { key: "school", permission: "view_reports", module: "reports" },
  { key: "library", permission: "view_library_reports", module: "library" },
  { key: "visitors", permission: "view_visitor_reports", module: "visitors" },
] as const satisfies readonly (NavModuleSection & { key: string })[];

/**
 * The universal scanner: classroom entry, late arrival, exit-permit stages
 * and the gate call permits; a library visit calls library. The server
 * authorizes each scan, so neither part needs a permission here.
 */
export const SCAN_SECTIONS: readonly NavModuleSection[] = [
  { module: "permits" },
  { module: "library" },
];

/**
 * The modules whose issued documents render through a document template:
 * leave letters (permits), warning letters (discipline) and visitor badges
 * (visitors). The template screen stays open while any of them is on.
 */
export const DOCUMENT_TEMPLATE_SECTIONS: readonly NavModuleSection[] = [
  { module: "permits" },
  { module: "discipline" },
  { module: "visitors" },
];

/** The modules of a section list, for tests and lookups. */
export function sectionModules(sections: readonly NavModuleSection[]): FeatureModule[] {
  return sections.map((section) => section.module);
}
