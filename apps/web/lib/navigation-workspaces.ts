import type { NavItem, NavProfileKind } from "./navigation";
import { NAV_GROUP } from "./navigation-groups";

interface WorkspaceDefinition {
  key: string;
  members: string[];
  label?: string;
  group?: string;
  detailPaths?: string[];
}

/** Presentation only: every original route remains in the authorization registry. */
const WORKSPACES: WorkspaceDefinition[] = [
  { key: "dashboard", members: ["dashboard", "library-dashboard"] },
  { key: "announcements", members: ["announcements"] },
  { key: "reports", members: ["reports", "library-reports", "visitors-recap"], label: "reports" },
  { key: "schedule", members: ["schedule", "school-calendar", "substitutions"], label: "schedule" },
  {
    key: "attendance",
    members: ["attendance", "journal", "attendance-reports"],
    label: "attendance",
  },
  { key: "grading", members: ["grading", "my-grades"], label: "grades" },
  { key: "homeroom", members: ["homeroom"], label: "homeroom" },
  {
    key: "leave-requests",
    members: ["leave-requests", "exit-permits", "late-arrivals"],
    label: "permits",
  },
  {
    key: "violations",
    members: ["violations", "warning-letters", "my-discipline"],
    label: "discipline",
    detailPaths: ["/discipline/students"],
  },
  { key: "counseling", members: ["counseling", "analytics"], label: "counseling" },
  {
    key: "activities-clubs",
    members: ["activities-clubs", "activities-events", "activities-achievements"],
    label: "activities",
  },
  {
    key: "mentoring-groups",
    members: ["mentoring-my-groups", "mentoring-groups"],
    label: "mentoring",
  },
  { key: "duty", members: ["duty", "monitor"], label: "duty", group: NAV_GROUP.duty },
  { key: "staff-attendance", members: ["staff-attendance"], label: "staffAttendance" },
  {
    key: "supervision-cycles",
    members: ["supervision-cycles", "supervision-my-report"],
    label: "supervision",
    detailPaths: ["/supervision/observations"],
  },
  {
    key: "school-classes",
    members: ["school-classes", "academic-enrollment-import"],
    label: "classes",
  },
  {
    key: "school-users",
    members: ["school-users", "settings-roles"],
    label: "users",
    group: NAV_GROUP.masterData,
  },
  { key: "school-learning", members: ["school-learning"], label: "subjects" },
  { key: "school-assignments", members: ["school-assignments"], label: "assignments" },
  {
    key: "academic-years",
    members: ["academic-years", "academic-new-year-setup", "school-promotion"],
    label: "years",
    group: NAV_GROUP.masterData,
  },
  { key: "school-structure", members: ["school-structure"], label: "structure" },
  {
    key: "library-catalogue",
    members: ["library-catalogue", "library-copies", "library-import", "library-master-data"],
    label: "catalogue",
  },
  {
    key: "library-desk",
    members: ["library-desk", "library-class-loans", "library-violations", "library-kiosk"],
    label: "circulation",
  },
  {
    key: "library-members",
    members: ["library-members"],
    label: "members",
  },
  {
    key: "library-settings",
    members: ["library-settings", "library-loan-rules", "library-member-types"],
    label: "librarySettings",
  },
  { key: "library-visits", members: ["library-visits", "library-visit-kiosk"], label: "visits" },
  { key: "library-stocktake", members: ["library-stocktake"], label: "stocktake" },
  { key: "library-me", members: ["library-me"], label: "loans" },
  {
    key: "visitors-board",
    members: ["visitors-board", "visitors-expected", "visitors-incidents"],
    label: "visitors",
    group: NAV_GROUP.duty,
  },
  { key: "billing", members: ["billing"], label: "billing" },
  {
    key: "settings",
    members: [
      "settings-hub",
      "settings-branding",
      "settings-document-templates",
      "settings-report-header",
      "settings-session",
      "settings-sso",
      "settings-notification-defaults",
      "settings-whatsapp",
      "settings-integrations",
      "settings-workflows",
      "settings-audit",
      "setup",
    ],
    label: "settings",
    group: NAV_GROUP.settings,
  },
  { key: "platform-tenants", members: ["platform-tenants"], label: "platform" },
];

export interface NavigationContext {
  profileKind?: NavProfileKind;
  duties?: readonly { slug: string }[];
  canManageSchool?: boolean;
  /**
   * Checked against `item.routePermission` when present: a member whose
   * own route guard (navigation-permissions.ts's `canOpenPath`) would
   * refuse it is not offered as a workspace's sole/selected destination,
   * even though it already passed the looser menu-visibility permission
   * that got it into `items`.
   */
  can?: (permission: string) => boolean;
}

function relevant(item: NavItem, context: NavigationContext): boolean {
  if (item.routePermission && context.can && !context.can(item.routePermission)) return false;
  // Readers find announcements in the header bell; only an author needs the
  // page as a destination of its own.
  if (item.key === "announcements" && context.can && !context.can("create_announcements"))
    return false;
  if (item.key === "homeroom")
    return context.duties?.some((duty) => duty.slug === "homeroom") ?? false;
  const personal = context.profileKind === "student";
  if (
    personal &&
    !context.canManageSchool &&
    (item.group === NAV_GROUP.masterData ||
      item.key === "academic-new-year-setup" ||
      item.key === "school-promotion")
  )
    return false;
  // Reference-data access is also granted to teaching accounts for schedules.
  if (
    context.profileKind === "teacher" &&
    !context.canManageSchool &&
    ["school-classes", "academic-years"].includes(item.key)
  )
    return false;
  return true;
}

function labelFor(
  definition: WorkspaceDefinition,
  selected: NavItem,
  context: NavigationContext,
): string {
  if (definition.key === "attendance" && context.profileKind === "student")
    return "app.workspace.myAttendance";
  if (definition.key === "grading" && selected.key === "my-grades") return "app.workspace.myGrades";
  if (definition.key === "violations" && selected.key === "my-discipline")
    return "app.workspace.myDiscipline";
  if (definition.key === "counseling" && selected.key === "analytics")
    return "app.workspace.monitoring";
  return definition.label ? `app.workspace.${definition.label}` : selected.labelKey;
}

/** Merge only the already authorized destinations; custom permission sets get safe fallbacks. */
export function consolidateNavigation(
  items: NavItem[],
  context: NavigationContext = {},
): NavItem[] {
  const available = items.filter((item) => relevant(item, context));
  const output = WORKSPACES.flatMap((definition): NavItem[] => {
    const members = definition.members.flatMap((key) =>
      available.filter((item) => item.key === key),
    );
    if (definition.key === "supervision-cycles" && context.profileKind === "teacher")
      members.sort(
        (a, b) =>
          Number(b.key === "supervision-my-report") - Number(a.key === "supervision-my-report"),
      );
    const selected = members[0];
    if (!selected) return [];
    return [
      {
        ...selected,
        key: definition.key,
        labelKey: labelFor(definition, selected, context),
        group: definition.group ?? selected.group,
        sidebarPlacement: ["settings", "platform-tenants"].includes(definition.key)
          ? "footer"
          : "main",
        aliases: members.map((item) => item.key),
        activePaths: [...members.map((item) => item.href), ...(definition.detailPaths ?? [])],
        searchTerms: members.map((item) => item.labelKey),
        tabLabelKey: ["attendance", "schedule", "leave-requests"].includes(definition.key)
          ? `app.workspace.short.${definition.key}`
          : selected.tabLabelKey,
      },
    ];
  });
  // These remain direct mobile/account actions, not entries in the browsable menu.
  const assigned = new Set(WORKSPACES.flatMap((definition) => definition.members));
  const additional = available.filter(
    (item) =>
      !assigned.has(item.key) &&
      !item.accountMenu &&
      item.key !== "classroom-entry" &&
      item.sidebarPlacement !== "hidden",
  );
  return [
    ...output,
    ...additional,
    ...items
      .filter((item) => item.accountMenu === true || item.key === "classroom-entry")
      .map((item) => ({ ...item, sidebarPlacement: "hidden" as const })),
  ];
}
