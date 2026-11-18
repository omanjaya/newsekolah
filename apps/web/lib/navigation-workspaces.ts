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
  { key: "dashboard", members: ["dashboard"] },
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
    members: [
      "activities-clubs",
      "activities-events",
      "activities-achievements",
      "mentoring-my-groups",
      "mentoring-groups",
    ],
    label: "studentActivities",
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
  { key: "school-learning", members: ["school-learning", "school-assignments"], label: "learning" },
  {
    key: "academic-years",
    members: ["academic-years", "academic-new-year-setup", "school-promotion"],
    label: "years",
    group: NAV_GROUP.masterData,
  },
  { key: "school-structure", members: ["school-structure"], label: "structure" },
  // The library's own home leads the library group, under the page's title.
  { key: "library-dashboard", members: ["library-dashboard"] },
  {
    key: "library-catalogue",
    members: [
      "library-catalogue",
      "library-copies",
      "library-import",
      "library-master-data",
      "library-stocktake",
    ],
    label: "catalogue",
  },
  {
    key: "library-desk",
    members: [
      "library-desk",
      "library-class-loans",
      "library-violations",
      "library-kiosk",
      "library-visits",
      "library-visit-kiosk",
    ],
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
  { key: "library-me", members: ["library-me"], label: "loans" },
  {
    key: "visitors-board",
    members: ["visitors-board", "visitors-expected", "visitors-incidents"],
    label: "visitors",
    group: NAV_GROUP.duty,
    // The recap is a tab of the visitors workspace nav and also a member of
    // the reports hub; while on the route the visitors entry stays active.
    detailPaths: ["/visitors/recap"],
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

/**
 * Each workspace's member keys: the registry pages that share one tab strip
 * (lib/navigation/page-context.ts). Read by lib/i18n/namespace-sets.ts so a
 * provider that carries one member's screen also carries its siblings' tab
 * labels.
 */
export const WORKSPACE_MEMBER_KEYS: readonly (readonly string[])[] = WORKSPACES.map(
  (definition) => definition.members,
);

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

/** Menu labels live in the shell catalog, in sentence case (app.shell.nav.items). */
const LABELS = "app.shell.nav.items";

function labelFor(
  definition: WorkspaceDefinition,
  selected: NavItem,
  context: NavigationContext,
): string {
  if (definition.key === "attendance" && context.profileKind === "student")
    return `${LABELS}.myAttendance`;
  if (definition.key === "grading" && selected.key === "my-grades") return `${LABELS}.myGrades`;
  if (definition.key === "violations" && selected.key === "my-discipline")
    return `${LABELS}.myDiscipline`;
  if (definition.key === "counseling" && selected.key === "analytics")
    return `${LABELS}.monitoring`;
  return definition.label ? `${LABELS}.${definition.label}` : selected.labelKey;
}

/**
 * Bottom tab bar labels: one short word each, so five fit a 360px phone
 * without truncating (app.shell.nav.short).
 */
const TAB_LABELS: Record<string, string> = {
  reports: "reports",
  attendance: "attendance",
  schedule: "schedule",
  "leave-requests": "permits",
  grading: "grades",
  violations: "discipline",
  counseling: "counseling",
  duty: "duty",
  "visitors-board": "visitors",
  "library-desk": "circulation",
  "library-catalogue": "catalogue",
  "library-members": "members",
  "school-users": "users",
  "school-classes": "classes",
};

/** Shorter labels for a row under its group heading (app.shell.nav.inGroup). */
const IN_GROUP_LABELS: Record<string, string> = {
  "library-settings": "app.shell.nav.inGroup.librarySettings",
};

/** docs/17: the top of the menu is daily work, in this order, before everything else. */
const LEADING_KEYS = ["dashboard", "inbox", "scan", "reports"];

function leadWithDailyDestinations(entries: NavItem[]): NavItem[] {
  const rank = (item: NavItem) => {
    const index = LEADING_KEYS.indexOf(item.key);
    return index === -1 ? LEADING_KEYS.length : index;
  };
  // Array.prototype.sort is stable, so the remaining order is untouched.
  return [...entries].sort((a, b) => rank(a) - rank(b));
}

/**
 * A workspace's `detailPaths` are routes it owns even when another workspace
 * also lists them as a member. The other workspace stops claiming them so
 * the menu highlights one entry for the route.
 */
function releaseClaimedDetailPaths(output: NavItem[], available: NavItem[]): void {
  const hrefByKey = new Map(available.map((item) => [item.key, item.href]));
  for (const definition of WORKSPACES) {
    const owner = output.find((item) => item.key === definition.key);
    if (!owner || !definition.detailPaths) continue;
    for (const other of output) {
      if (other === owner) continue;
      const memberHrefs = new Set(
        (other.aliases ?? []).map((key) => hrefByKey.get(key)).filter(Boolean),
      );
      other.activePaths = other.activePaths?.filter(
        (path) => !(definition.detailPaths ?? []).includes(path) || !memberHrefs.has(path),
      );
    }
  }
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
    const tab = TAB_LABELS[definition.key];
    return [
      {
        ...selected,
        // A workspace spans several destinations, so it belongs to no single
        // module: its members were already filtered by module.
        module: undefined,
        key: definition.key,
        labelKey: labelFor(definition, selected, context),
        group: definition.group ?? selected.group,
        sidebarPlacement: ["settings", "platform-tenants"].includes(definition.key)
          ? "footer"
          : "main",
        aliases: members.map((item) => item.key),
        activePaths: [...members.map((item) => item.href), ...(definition.detailPaths ?? [])],
        searchTerms: members.map((item) => item.labelKey),
        tabLabelKey: tab ? `app.shell.nav.short.${tab}` : selected.tabLabelKey,
        groupLabelKey: IN_GROUP_LABELS[definition.key] ?? selected.groupLabelKey,
      },
    ];
  });
  releaseClaimedDetailPaths(output, available);
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
    ...leadWithDailyDestinations([...output, ...additional]),
    ...items
      .filter((item) => item.accountMenu === true || item.key === "classroom-entry")
      .map((item) => ({ ...item, sidebarPlacement: "hidden" as const })),
  ];
}
