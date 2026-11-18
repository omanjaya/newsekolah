import { domainIcons } from "@newsekolah/ui";
import {
  ArrowLeftRight,
  Barcode,
  BookCopy,
  BookMarked,
  FileChartPie,
  Footprints,
  Gavel,
  Hourglass,
  IdCard,
  Layers,
  LibraryBig,
  MonitorSmartphone,
  ScanBarcode,
  SlidersHorizontal,
  TabletSmartphone,
  Tags,
  Upload,
} from "lucide-react";

import type { NavItem } from "./navigation";

/** The library's working permissions: who has a library day to look at. */
const LIBRARY_STAFF = [
  "manage_library_circulation",
  "manage_library_catalog",
  "view_library_reports",
];

/**
 * Library module screens, split out of `navigation.ts` so that file stays
 * under the 400-line cap (docs/04-clean-code.md), mirroring
 * navigation-academic.ts. Spread into the `library` group in
 * `navigation.ts`. Each entry has a glyph of its own, since the palette
 * lists them side by side.
 */
export const libraryNavItems: NavItem[] = [
  {
    key: "library-dashboard",
    // The page's own title, so the menu entry and the heading read alike;
    // under the Perpustakaan heading the row says just "Dasbor".
    labelKey: "app.library.dashboard.title",
    groupLabelKey: "app.library.dashboard.navLabel",
    href: "/library",
    module: "library",
    icon: domainIcons.library,
    permission: "view_library",
    // Every teacher can browse the catalogue (view_library); the day's
    // circulation is offered to the people who run or oversee the library.
    offeredTo: { anyPermission: LIBRARY_STAFF },
    group: "nav.library.label",
  },
  {
    key: "library-catalogue",
    labelKey: "nav.library.items.catalog",
    href: "/library/catalogue",
    module: "library",
    icon: LibraryBig,
    permission: "view_library",
    group: "nav.library.label",
  },
  {
    key: "library-copies",
    labelKey: "app.library.copiesBrowser.navLabel",
    href: "/library/copies",
    module: "library",
    icon: Barcode,
    permission: "view_library",
    group: "nav.library.label",
  },
  {
    key: "library-desk",
    labelKey: "nav.library.items.circulation",
    href: "/library/desk",
    module: "library",
    icon: ArrowLeftRight,
    permission: "manage_library_circulation",
    group: "nav.library.label",
  },
  {
    key: "library-class-loans",
    labelKey: "app.library.classLoans.navLabel",
    href: "/library/class-loans",
    module: "library",
    icon: BookCopy,
    permission: "manage_library_circulation",
    group: "nav.library.label",
  },
  {
    key: "library-stocktake",
    labelKey: "nav.library.items.stockOpname",
    href: "/library/stocktake",
    module: "library",
    icon: ScanBarcode,
    permission: "manage_library_catalog",
    group: "nav.library.label",
  },
  {
    key: "library-master-data",
    labelKey: "app.library.masterData.navLabel",
    href: "/library/master-data",
    module: "library",
    icon: Tags,
    permission: "view_library",
    group: "nav.library.label",
  },
  {
    key: "library-settings",
    labelKey: "app.librarySettings.title",
    href: "/library/settings",
    module: "library",
    icon: SlidersHorizontal,
    permission: "manage_library_settings",
    group: "nav.library.label",
  },
  {
    key: "library-loan-rules",
    labelKey: "app.library.loanRules.navLabel",
    href: "/library/loan-rules",
    module: "library",
    icon: Hourglass,
    permission: "manage_library_settings",
    // Only redirects to its section of /library/settings now: the route
    // stays for old links, but it is no destination of its own.
    sidebarPlacement: "hidden",
    routeOnly: true,
    group: "nav.library.label",
  },
  {
    key: "library-reports",
    labelKey: "app.library.reports.navLabel",
    href: "/library/reports",
    module: "library",
    icon: FileChartPie,
    permission: "view_library_reports",
    group: "nav.library.label",
  },
  {
    key: "library-kiosk",
    labelKey: "app.library.kiosk.navLabel",
    href: "/library/kiosk",
    module: "library",
    icon: MonitorSmartphone,
    permission: "manage_library_circulation",
    group: "nav.library.label",
  },
  {
    key: "library-members",
    labelKey: "app.library.members.navLabel",
    href: "/library/members",
    module: "library",
    icon: IdCard,
    permission: "manage_library_members",
    group: "nav.library.label",
  },
  {
    key: "library-member-types",
    labelKey: "app.library.memberTypes.navLabel",
    href: "/library/member-types",
    module: "library",
    icon: Layers,
    permission: "manage_library_settings",
    // Redirects to its section of /library/settings, like loan rules.
    sidebarPlacement: "hidden",
    routeOnly: true,
    group: "nav.library.label",
  },
  {
    key: "library-violations",
    labelKey: "app.library.violations.navLabel",
    href: "/library/violations",
    module: "library",
    // Not the discipline shield: a library violation is a fine or a sanction.
    icon: Gavel,
    permission: "manage_library_circulation",
    group: "nav.library.label",
  },
  {
    key: "library-import",
    labelKey: "app.library.import.navLabel",
    href: "/library/import",
    module: "library",
    icon: Upload,
    permission: "manage_library_catalog",
    group: "nav.library.label",
  },
  {
    key: "library-visits",
    labelKey: "app.library.visits.navLabel",
    href: "/library/visits",
    module: "library",
    icon: Footprints,
    permission: "manage_library_circulation",
    group: "nav.library.label",
  },
  {
    key: "library-visit-kiosk",
    labelKey: "app.library.visitKiosk.navLabel",
    href: "/library/visit-kiosk",
    module: "library",
    icon: TabletSmartphone,
    permission: "manage_library_circulation",
    group: "nav.library.label",
  },
  {
    key: "library-me",
    labelKey: "app.library.me.navLabel",
    href: "/library/me",
    module: "library",
    icon: BookMarked,
    permission: "view_own_library_loans",
    group: "nav.library.label",
  },
];
