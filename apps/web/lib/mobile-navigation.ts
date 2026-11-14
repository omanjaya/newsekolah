import { Zap, type LucideIcon } from "lucide-react";

import type { NavItem, NavProfileKind } from "./navigation";
import { activeNavHref } from "./navigation/active-href";
import { quickActionHref, type QuickAction, type QuickActionId } from "./quick-actions";

/** Destinations between Beranda and Menu in the bottom tab bar when there is no centre action. */
const DAILY_SLOTS = 3;

/** Shape of `Me["duties"]`: only the slug matters here. */
type Duties = readonly { slug: string }[] | undefined;

/**
 * The persona a reader's phone bar is built for, from the work each one
 * does every day (docs/07-ui-ux.md section 1). The reader's duties
 * (picket, counselor, security, librarian, leadership, homeroom) name the
 * persona when present; otherwise the already authorized registry does,
 * since an entry is only there when the reader holds the permission
 * behind it.
 */
export type MobilePersona =
  | "student"
  | "office"
  | "counselor"
  | "picket"
  | "security"
  | "librarian"
  | "leadership"
  | "gate"
  | "teacher"
  | "other";

export function mobilePersona(
  items: NavItem[],
  profile: NavProfileKind | undefined,
  duties: Duties,
): MobilePersona {
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

  if (profile === "student") return "student";
  // The school office: the account screens only it can open.
  if (has("school-users")) return "office";
  if (counselor) return "counselor";
  if (holds("picket")) return "picket";
  if (holds("security")) return "security";
  if (holds("librarian") || has("library-desk")) return "librarian";
  if (holds("leadership") || has("staff-attendance")) return "leadership";
  if (has("visitors-board")) return "gate";
  if (profile === "teacher") return "teacher";
  return "other";
}

/** Which daily destinations a reader's tab bar leads with, most important first. */
function dailyPriorities(
  items: NavItem[],
  profile: NavProfileKind | undefined,
  duties: Duties,
): string[] {
  const has = (key: string) => items.some((item) => item.key === key);
  const holds = (slug: string) => duties?.some((duty) => duty.slug === slug) ?? false;
  switch (mobilePersona(items, profile, duties)) {
    // Scanning into class happens every lesson; a leave request is the
    // student's other own task. Grades and the library live in Menu.
    case "student":
      return ["schedule", "scan", "leave-requests"];
    // The school office: the approval queue, accounts, and the rosters.
    case "office":
      return ["inbox", "school-users", "school-classes"];
    case "counselor":
      return ["inbox", "counseling", "violations"];
    // Picket duty: the QR desk first, then the scanner for late arrivals and
    // exit permits; a picket teacher still teaches.
    case "picket":
      return ["duty", "scan", "attendance"];
    // Gate duty (satpam): the gate scanner, the visitor book, exit permits.
    case "security":
    case "gate":
      return ["scan", "visitors-board", "leave-requests"];
    case "librarian":
      return ["library-desk", "library-catalogue", "library-members"];
    // School leadership: decisions waiting, the reports, and attendance.
    case "leadership":
      return ["inbox", "reports", "attendance"];
    case "teacher":
      return holds("homeroom") || has("homeroom")
        ? ["attendance", "inbox", "schedule"]
        : ["attendance", "schedule", "grading"];
    case "other":
      return ["inbox", "scan", "schedule", "attendance", "reports"];
  }
}

export interface MobileNavigationOptions {
  /** A destination already offered elsewhere on the bar (the centre action's), left out of the tabs. */
  exclude?: string;
  /** How many daily destinations follow Beranda; three by default, two beside a centre action. */
  slots?: number;
}

/**
 * The bottom tab bar's destinations: Beranda, then the reader's daily
 * destinations, topped up with Profil and other everyday pages when the
 * reader has fewer. Menu (and the centre action, if any) are added by the
 * tab bar itself.
 */
export function mobileNavigation(
  items: NavItem[],
  profile?: NavProfileKind,
  duties?: Duties,
  { exclude, slots = DAILY_SLOTS }: MobileNavigationOptions = {},
): NavItem[] {
  const find = (key: string) => items.find((item) => item.key === key);
  const candidates = [...dailyPriorities(items, profile, duties), "profile", "inbox", "scan"];
  const daily: NavItem[] = [];
  for (const key of candidates) {
    const item = find(key);
    if (item && item.key !== "dashboard" && item.href !== exclude && !daily.includes(item)) {
      daily.push(item);
    }
  }
  const home = find("dashboard");
  return [...(home ? [home] : []), ...daily.slice(0, slots)];
}

/**
 * What the raised round button in the middle of the bar does: the
 * reader's one main act of the day.
 */
export type CentreActionId =
  | "scan"
  | "duty-qr"
  | "attendance"
  | "circulation"
  | "record-violation"
  | "inbox"
  | "check-in"
  | "add-visitor"
  | "submit-leave"
  | "quick-actions";

export interface MobileCentreAction {
  id: CentreActionId;
  /** Where the button goes. Absent for `quick-actions`, which opens the quick-action sheet. */
  href?: string;
  /**
   * The menu entry the destination belongs to. That entry leaves the tabs
   * (the button already leads there), and the button reads as current on
   * its pages instead of Menu.
   */
  ownerHref?: string;
  icon: LucideIcon;
  /** The quick action the button stands for, kept out of Menu's quick-action list. */
  quickActionId?: QuickActionId;
}

/** The centre id a single quick action takes when it is the reader's main act. */
const CENTRE_FOR_QUICK_ACTION: Record<QuickActionId, CentreActionId> = {
  "scan-qr": "scan",
  "show-duty-qr": "duty-qr",
  "lend-book": "circulation",
  "record-violation": "record-violation",
  "check-in": "check-in",
  "add-visitor": "add-visitor",
  "submit-leave": "submit-leave",
};

export interface MobileCentreInput {
  /** The reader's authorized (and consolidated) menu. */
  items: NavItem[];
  profile?: NavProfileKind;
  duties?: Duties;
  /** The quick actions the reader may perform (`availableQuickActions`), most frequent first. */
  quickActions: readonly QuickAction[];
  /**
   * The route check the home hero uses (`canOpenPath`): the button never
   * leads to a page that would answer "no access" or "module off".
   */
  canOpen: (path: string) => boolean;
}

function pathOf(href: string): string {
  return href.split("?")[0] ?? href;
}

function fromQuickAction(
  input: MobileCentreInput,
  id: QuickActionId,
): MobileCentreAction | undefined {
  const action = input.quickActions.find((candidate) => candidate.id === id);
  if (!action || !input.canOpen(action.path)) return undefined;
  return {
    id: CENTRE_FOR_QUICK_ACTION[id],
    href: quickActionHref(action),
    ownerHref: activeNavHref(action.path, input.items),
    icon: action.icon,
    quickActionId: id,
  };
}

function fromMenu(
  input: MobileCentreInput,
  key: string,
  id: CentreActionId,
): MobileCentreAction | undefined {
  const item = input.items.find((candidate) => candidate.key === key);
  if (!item || !input.canOpen(pathOf(item.href))) return undefined;
  return { id, href: item.href, ownerHref: item.href, icon: item.icon };
}

/**
 * For readers whose day has no single act: the quick-action sheet when
 * several actions are equally likely, the one action when there is only
 * one, else the queue of decisions waiting on them.
 */
function general(input: MobileCentreInput): MobileCentreAction | undefined {
  const [first, second] = input.quickActions;
  if (second) return { id: "quick-actions", icon: Zap };
  if (first) return fromQuickAction(input, first.id);
  return fromMenu(input, "inbox", "inbox");
}

/**
 * The reader's centre action, from their persona's daily task and what
 * their home hero already offers:
 * - student, satpam (and other gate staff): Pindai;
 * - guru piket: the duty QR, which students scan at the desk;
 * - guru: Isi presensi (the tab bar points it at the running or next
 *   session once today's sessions are known);
 * - pustakawan: the circulation desk;
 * - guru BK: recording a violation, the one act they start themselves
 *   (their queue and counselling are tabs);
 * - kepala sekolah and wakil: the decisions waiting on them;
 * - admin and anyone else: the quick-action sheet.
 * When that destination is closed to the reader, they get the general
 * choice instead; never a page they cannot open.
 */
export function mobileCentreAction(input: MobileCentreInput): MobileCentreAction | undefined {
  const persona = mobilePersona(input.items, input.profile, input.duties);
  const preferred = (() => {
    switch (persona) {
      case "student":
      case "security":
        return fromQuickAction(input, "scan-qr");
      case "gate":
        return fromQuickAction(input, "scan-qr") ?? fromQuickAction(input, "add-visitor");
      case "picket":
        return fromQuickAction(input, "show-duty-qr") ?? fromQuickAction(input, "scan-qr");
      case "teacher":
        return fromMenu(input, "attendance", "attendance");
      case "librarian":
        return fromQuickAction(input, "lend-book");
      case "counselor":
        return fromQuickAction(input, "record-violation");
      case "leadership":
        return fromMenu(input, "inbox", "inbox");
      case "office":
      case "other":
        return undefined;
    }
  })();
  return preferred ?? general(input);
}

export interface MobileTabLayout {
  /** Beranda and the daily destinations, in bar order (the centre action sits after the second). */
  tabs: NavItem[];
  centre?: MobileCentreAction;
}

/**
 * The whole phone bar: two tabs, the centre action, one tab, then Menu;
 * or Beranda and three tabs before Menu for a reader without a centre
 * action. The centre's own destination never doubles as a tab.
 */
export function mobileTabLayout(input: MobileCentreInput): MobileTabLayout {
  const centre = mobileCentreAction(input);
  const tabs = mobileNavigation(input.items, input.profile, input.duties, {
    exclude: centre?.ownerHref,
    slots: centre ? DAILY_SLOTS - 1 : DAILY_SLOTS,
  });
  return centre ? { tabs, centre } : { tabs };
}

/**
 * The quick actions the Menu sheet lists, so every action the floating
 * button used to offer stays reachable: all of them except the one the
 * centre button already is, and none when the centre button opens the
 * quick-action sheet itself.
 */
export function menuQuickActions(
  quickActions: readonly QuickAction[],
  centre: MobileCentreAction | undefined,
): QuickAction[] {
  if (centre?.id === "quick-actions") return [];
  return quickActions.filter((action) => action.id !== centre?.quickActionId);
}

/** The bar's root destinations (each tab and the centre's page), for telling a tab switch apart from a push. */
export function mobileTabRoots(layout: MobileTabLayout): string[] {
  const roots = layout.tabs.map((item) => pathOf(item.href));
  if (layout.centre?.ownerHref) roots.push(pathOf(layout.centre.ownerHref));
  return roots;
}
