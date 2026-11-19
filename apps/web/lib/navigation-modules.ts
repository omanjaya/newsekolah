import { domainIcons } from "@newsekolah/ui";
import { CalendarClock, CalendarRange, FileChartLine, Trophy, Volleyball } from "lucide-react";

import type { NavItem } from "./navigation";
import { NAV_GROUP } from "./navigation-groups";

/**
 * Nav entries for the Fase 6 modules (docs/12-roadmap.md), split out of
 * `navigation.ts` so that file stays under the 400-line cap
 * (docs/04-clean-code.md). Spread into `navigation.ts` after the academic
 * entries.
 */
export const moduleNavItems: NavItem[] = [
  {
    key: "visitors-board",
    labelKey: "nav.visitors.items.board",
    href: "/visitors/board",
    module: "visitors",
    icon: domainIcons.visitor,
    permission: "view_visitors",
    group: NAV_GROUP.administration,
  },
  {
    key: "visitors-expected",
    labelKey: "nav.visitors.items.expected",
    href: "/visitors/expected",
    module: "visitors",
    // Not the visitor board's glyph: these guests are booked, not on site.
    icon: CalendarClock,
    permission: "view_visitors",
    group: NAV_GROUP.administration,
  },
  {
    key: "visitors-incidents",
    labelKey: "nav.visitors.items.incidents",
    href: "/visitors/incidents",
    module: "visitors",
    icon: domainIcons.incident,
    permission: "view_visitor_incidents",
    group: NAV_GROUP.administration,
  },
  {
    key: "visitors-recap",
    labelKey: "nav.visitors.items.reports",
    href: "/visitors/recap",
    module: "visitors",
    icon: FileChartLine,
    permission: "view_visitor_reports",
    group: NAV_GROUP.administration,
  },
  {
    key: "activities-clubs",
    labelKey: "app.activities.navLabelClubs",
    href: "/activities/clubs",
    module: "activities",
    // Not the homeroom's people glyph.
    icon: Volleyball,
    permission: "view_activities",
    group: NAV_GROUP.students,
  },
  {
    key: "activities-events",
    labelKey: "app.activities.navLabelEvents",
    href: "/activities/events",
    module: "activities",
    icon: CalendarRange,
    permission: "view_activities",
    group: NAV_GROUP.students,
  },
  {
    key: "activities-achievements",
    labelKey: "app.activities.navLabelAchievements",
    href: "/activities/achievements",
    module: "activities",
    icon: Trophy,
    permission: "view_activities",
    group: NAV_GROUP.students,
  },
  {
    key: "billing",
    labelKey: "app.billing.navLabel",
    href: "/billing",
    module: "billing",
    icon: domainIcons.billing,
    permission: "view_billing",
    group: NAV_GROUP.administration,
  },
  {
    key: "mentoring-groups",
    labelKey: "app.mentoring.navLabelGroups",
    href: "/mentoring/groups",
    module: "mentoring",
    icon: domainIcons.mentoring,
    permission: "view_mentoring",
    group: NAV_GROUP.students,
  },
  {
    key: "mentoring-my-groups",
    labelKey: "app.mentoring.navLabelMyGroups",
    href: "/mentoring/my-groups",
    module: "mentoring",
    icon: domainIcons.mentoring,
    permission: "view_mentoring",
    group: NAV_GROUP.students,
  },
  {
    key: "supervision-cycles",
    labelKey: "app.supervision.navLabelCycles",
    href: "/supervision/cycles",
    module: "supervision",
    icon: domainIcons.supervision,
    permission: "view_supervision",
    group: NAV_GROUP.staff,
  },
  {
    key: "supervision-observation",
    labelKey: "app.supervision.navLabelCycles",
    href: "/supervision/observations",
    module: "supervision",
    icon: domainIcons.supervision,
    // Reached from a cycle or a report, never browsed. Open to the
    // school-wide reader and to the observed teacher (view_own_supervision,
    // scoped to their own observations by the API).
    anyPermission: ["view_supervision", "view_own_supervision"],
    sidebarPlacement: "hidden",
    routeOnly: true,
    group: NAV_GROUP.staff,
  },
  {
    key: "supervision-my-report",
    labelKey: "app.supervision.navLabelMyReport",
    href: "/supervision/my-report",
    module: "supervision",
    icon: domainIcons.supervision,
    // The observed teacher's own results: view_own_supervision (the
    // teacher's default) or view_supervision. Same Kepegawaian group as the
    // cycles, so the sidebar order from docs/17 stays as it is.
    anyPermission: ["view_supervision", "view_own_supervision"],
    group: NAV_GROUP.staff,
  },
];
