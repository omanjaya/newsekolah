import type { NavItem, NavProfileKind } from "./navigation";

/** Destinations between Beranda and Menu in the bottom tab bar. */
const DAILY_SLOTS = 3;

/** Shape of `Me["duties"]`: only the slug matters here. */
type Duties = readonly { slug: string }[] | undefined;

/**
 * Which daily destinations a reader's tab bar leads with, from the work
 * each persona does every day (docs/07-ui-ux.md section 1). The reader's
 * duties (picket, counselor, security, librarian, leadership, homeroom)
 * name the persona when present; otherwise the already authorized
 * registry does, since an entry is only there when the reader holds the
 * permission behind it.
 */
function dailyPriorities(items: NavItem[], profile: NavProfileKind | undefined, duties: Duties) {
  const has = (key: string) => items.some((item) => item.key === key);
  const holds = (slug: string) => duties?.some((duty) => duty.slug === slug) ?? false;
  // The counseling workspace can also open on the early-warning page alone
  // (a principal's "Pemantauan siswa"); only the counseling page itself
  // marks a counselor.
  const counselor =
    holds("counselor") ||
    items.some((item) =>
      item.aliases ? item.aliases.includes("counseling") : item.key === "counseling",
    );

  // Scanning into class happens every lesson; a leave request is the
  // student's other own task. Grades and the library live in Menu.
  if (profile === "student") return ["schedule", "scan", "leave-requests"];
  // The school office: the approval queue, accounts, and the rosters.
  if (has("school-users")) return ["inbox", "school-users", "school-classes"];
  if (counselor) return ["inbox", "counseling", "violations"];
  // Picket duty: the QR desk first, then the scanner for late arrivals and
  // exit permits; a picket teacher still teaches.
  if (holds("picket")) return ["duty", "scan", "attendance"];
  // Gate duty (satpam): the gate scanner, the visitor book, exit permits.
  if (holds("security")) return ["scan", "visitors-board", "leave-requests"];
  if (holds("librarian") || has("library-desk")) {
    return ["library-desk", "library-catalogue", "library-members"];
  }
  // School leadership: decisions waiting, the reports, and attendance.
  if (holds("leadership") || has("staff-attendance")) return ["inbox", "reports", "attendance"];
  if (has("visitors-board")) return ["scan", "visitors-board", "leave-requests"];
  if (profile === "teacher") {
    return holds("homeroom") || has("homeroom")
      ? ["attendance", "inbox", "schedule"]
      : ["attendance", "schedule", "grading"];
  }
  return ["inbox", "scan", "schedule", "attendance", "reports"];
}

/**
 * The bottom tab bar's destinations: Beranda, then three of the reader's
 * daily destinations, topped up with Profil and other everyday pages when
 * the reader has fewer. Menu is added by the tab bar itself.
 */
export function mobileNavigation(
  items: NavItem[],
  profile?: NavProfileKind,
  duties?: Duties,
): NavItem[] {
  const find = (key: string) => items.find((item) => item.key === key);
  const candidates = [...dailyPriorities(items, profile, duties), "profile", "inbox", "scan"];
  const daily: NavItem[] = [];
  for (const key of candidates) {
    const item = find(key);
    if (item && item.key !== "dashboard" && !daily.includes(item)) daily.push(item);
  }
  const home = find("dashboard");
  return [...(home ? [home] : []), ...daily.slice(0, DAILY_SLOTS)];
}
