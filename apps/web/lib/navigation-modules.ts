import { domainIcons } from "@newsekolah/ui";
import { CalendarRange, FileBarChart, Trophy, UsersRound } from "lucide-react";

import type { NavItem } from "./navigation";

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
    group: "nav.visitors.label",
  },
  {
    key: "visitors-expected",
    labelKey: "nav.visitors.items.expected",
    href: "/visitors/expected",
    icon: domainIcons.visitor,
    permission: "view_visitors",
    group: "nav.visitors.label",
  },
  {
    key: "visitors-incidents",
    labelKey: "nav.visitors.items.incidents",
    href: "/visitors/incidents",
    icon: domainIcons.incident,
    permission: "view_visitor_incidents",
    group: "nav.visitors.label",
  },
  {
    key: "visitors-recap",
    labelKey: "nav.visitors.items.reports",
    href: "/visitors/recap",
    icon: FileBarChart,
    permission: "view_visitor_reports",
    group: "nav.visitors.label",
  },
  {
    key: "activities-clubs",
    labelKey: "app.activities.navLabelClubs",
    href: "/activities/clubs",
    icon: UsersRound,
    permission: "view_activities",
    group: "nav.activities.label",
  },
  {
    key: "activities-events",
    labelKey: "app.activities.navLabelEvents",
    href: "/activities/events",
    icon: CalendarRange,
    permission: "view_activities",
    group: "nav.activities.label",
  },
  {
    key: "activities-achievements",
    labelKey: "app.activities.navLabelAchievements",
    href: "/activities/achievements",
    icon: Trophy,
    permission: "view_activities",
    group: "nav.activities.label",
  },
  {
    key: "billing",
    labelKey: "app.billing.navLabel",
    href: "/billing",
    icon: domainIcons.billing,
    permission: "view_billing",
    group: "nav.finance.label",
  },
  {
    key: "mentoring-groups",
    labelKey: "app.mentoring.navLabelGroups",
    href: "/mentoring/groups",
    icon: domainIcons.mentoring,
    permission: "view_mentoring",
    group: "nav.mentoring.label",
  },
  {
    key: "mentoring-my-groups",
    labelKey: "app.mentoring.navLabelMyGroups",
    href: "/mentoring/my-groups",
    icon: domainIcons.mentoring,
    permission: "view_mentoring",
    group: "nav.mentoring.label",
  },
  {
    key: "supervision-cycles",
    labelKey: "app.supervision.navLabelCycles",
    href: "/supervision/cycles",
    icon: domainIcons.supervision,
    permission: "view_supervision",
    group: "nav.supervision.label",
  },
  {
    key: "supervision-my-report",
    labelKey: "app.supervision.navLabelMyReport",
    href: "/supervision/my-report",
    icon: domainIcons.supervision,
    permission: "view_supervision",
    group: "nav.supervision.label",
  },
];
