import { domainIcons } from "@newsekolah/ui";

import type { NavItem } from "./navigation";

/**
 * Library module screens, split out of `navigation.ts` so that file stays
 * under the 400-line cap (docs/04-clean-code.md), mirroring
 * navigation-academic.ts. Spread into the `library` group in
 * `navigation.ts`.
 */
export const libraryNavItems: NavItem[] = [
  {
    key: "library-dashboard",
    labelKey: "app.library.dashboard.navLabel",
    href: "/library",
    icon: domainIcons.library,
    permission: "view_library",
    group: "nav.library.label",
  },
  {
    key: "library-catalogue",
    labelKey: "nav.library.items.catalog",
    href: "/library/catalogue",
    icon: domainIcons.library,
    permission: "view_library",
    group: "nav.library.label",
  },
  {
    key: "library-desk",
    labelKey: "nav.library.items.circulation",
    href: "/library/desk",
    icon: domainIcons.library,
    permission: "manage_library_circulation",
    group: "nav.library.label",
  },
  {
    key: "library-class-loans",
    labelKey: "app.library.classLoans.navLabel",
    href: "/library/class-loans",
    icon: domainIcons.library,
    permission: "manage_library_circulation",
    group: "nav.library.label",
  },
  {
    key: "library-stocktake",
    labelKey: "nav.library.items.stockOpname",
    href: "/library/stocktake",
    icon: domainIcons.library,
    permission: "manage_library_catalog",
    group: "nav.library.label",
  },
  {
    key: "library-master-data",
    labelKey: "app.library.masterData.navLabel",
    href: "/library/master-data",
    icon: domainIcons.library,
    permission: "view_library",
    group: "nav.library.label",
  },
  {
    key: "library-loan-rules",
    labelKey: "app.library.loanRules.navLabel",
    href: "/library/loan-rules",
    icon: domainIcons.library,
    permission: "manage_library_settings",
    group: "nav.library.label",
  },
  {
    key: "library-reports",
    labelKey: "app.library.reports.navLabel",
    href: "/library/reports",
    icon: domainIcons.library,
    permission: "view_library_reports",
    group: "nav.library.label",
  },
  {
    key: "library-kiosk",
    labelKey: "app.library.kiosk.navLabel",
    href: "/library/kiosk",
    icon: domainIcons.library,
    permission: "manage_library_circulation",
    group: "nav.library.label",
  },
  {
    key: "library-members",
    labelKey: "app.library.members.navLabel",
    href: "/library/members",
    icon: domainIcons.library,
    permission: "manage_library_members",
    group: "nav.library.label",
  },
  {
    key: "library-member-types",
    labelKey: "app.library.memberTypes.navLabel",
    href: "/library/member-types",
    icon: domainIcons.library,
    permission: "manage_library_settings",
    group: "nav.library.label",
  },
  {
    key: "library-violations",
    labelKey: "app.library.violations.navLabel",
    href: "/library/violations",
    icon: domainIcons.violation,
    permission: "manage_library_circulation",
    group: "nav.library.label",
  },
  {
    key: "library-import",
    labelKey: "app.library.import.navLabel",
    href: "/library/import",
    icon: domainIcons.library,
    permission: "manage_library_catalog",
    group: "nav.library.label",
  },
  {
    key: "library-visits",
    labelKey: "app.library.visits.navLabel",
    href: "/library/visits",
    icon: domainIcons.library,
    permission: "manage_library_circulation",
    group: "nav.library.label",
  },
  {
    key: "library-visit-kiosk",
    labelKey: "app.library.visitKiosk.navLabel",
    href: "/library/visit-kiosk",
    icon: domainIcons.library,
    permission: "manage_library_circulation",
    group: "nav.library.label",
  },
  {
    key: "library-me",
    labelKey: "app.library.me.navLabel",
    href: "/library/me",
    icon: domainIcons.library,
    permission: "view_own_library_loans",
    group: "nav.library.label",
  },
];
