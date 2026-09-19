import { domainIcons } from "@newsekolah/ui";
import { CalendarRange, FileBarChart, Trophy, UsersRound } from "lucide-react";

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
    icon: domainIcons.visitor,
    permission: "view_visitors",
    group: NAV_GROUP.administration,
  },
  {
    key: "visitors-expected",
    labelKey: "nav.visitors.items.expected",
    href: "/visitors/expected",
    icon: domainIcons.visitor,
    permission: "view_visitors",
    group: NAV_GROUP.administration,
  },
  {
    key: "visitors-incidents",
    labelKey: "nav.visitors.items.incidents",
    href: "/visitors/incidents",
    icon: domainIcons.incident,
    permission: "view_visitor_incidents",
    group: NAV_GROUP.administration,
  },
  {
    key: "visitors-recap",
    labelKey: "nav.visitors.items.reports",
    href: "/visitors/recap",
    icon: FileBarChart,
    permission: "view_visitor_reports",
    group: NAV_GROUP.administration,
  },
  {
    key: "activities-clubs",
    labelKey: "app.activities.navLabelClubs",
    href: "/activities/clubs",
    icon: UsersRound,
    permission: "view_activities",
    group: NAV_GROUP.students,
  },
  {
    key: "activities-events",
    labelKey: "app.activities.navLabelEvents",
    href: "/activities/events",
    icon: CalendarRange,
    permission: "view_activities",
    group: NAV_GROUP.students,
  },
  {
    key: "activities-achievements",
    labelKey: "app.activities.navLabelAchievements",
    href: "/activities/achievements",
    icon: Trophy,
    permission: "view_activities",
    group: NAV_GROUP.students,
  },
  {
    key: "billing",
    labelKey: "app.billing.navLabel",
    href: "/billing",
    icon: domainIcons.billing,
    permission: "view_billing",
    group: NAV_GROUP.administration,
  },
  {
    key: "mentoring-groups",
    labelKey: "app.mentoring.navLabelGroups",
    href: "/mentoring/groups",
    icon: domainIcons.mentoring,
    permission: "view_mentoring",
    group: NAV_GROUP.students,
  },
  {
    key: "mentoring-my-groups",
    labelKey: "app.mentoring.navLabelMyGroups",
    href: "/mentoring/my-groups",
    icon: domainIcons.mentoring,
    permission: "view_mentoring",
    group: NAV_GROUP.students,
  },
  {
    key: "supervision-cycles",
    labelKey: "app.supervision.navLabelCycles",
    href: "/supervision/cycles",
    icon: domainIcons.supervision,
    permission: "view_supervision",
    group: NAV_GROUP.staff,
  },
  {
    key: "supervision-my-report",
    labelKey: "app.supervision.navLabelMyReport",
    href: "/supervision/my-report",
    icon: domainIcons.supervision,
    permission: "view_supervision",
    group: NAV_GROUP.staff,
  },
];
