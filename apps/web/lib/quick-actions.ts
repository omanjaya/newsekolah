import { domainIcons } from "@newsekolah/ui";
import { BookOpen, ClipboardList, LogIn, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { NavProfileKind } from "./navigation";
import { canOpenPath } from "./navigation-permissions";

/**
 * Query parameter a target screen reads to start an action (see
 * `useQuickAction`). Screens strip it again once handled, so a reload or a
 * shared link never re-opens the dialog.
 */
export const QUICK_ACTION_PARAM = "quick";

export type QuickActionId =
  | "record-violation"
  | "submit-leave"
  | "show-duty-qr"
  | "add-visitor"
  | "lend-book"
  | "check-in"
  | "scan-qr";

export interface QuickAction {
  id: QuickActionId;
  /** Key under the `app.quickActions.actions` namespace. */
  labelKey: string;
  icon: LucideIcon;
  /** Route of the screen that performs the action. */
  path: string;
  /** Extra query parameters that put the screen in the state that starts the action. */
  query?: Readonly<Record<string, string>>;
  /**
   * Permission the target screen's own control needs. Reaching the screen is
   * checked separately against the navigation registry (`canOpenPath`), which
   * also covers profile-kind scoping, so actions without a permission of
   * their own (check-in, scan) still hide from readers who cannot open them.
   */
  permission?: string;
}

export const quickActions: readonly QuickAction[] = [
  {
    id: "record-violation",
    labelKey: "recordViolation",
    icon: domainIcons.violation,
    path: "/discipline/violations",
    query: { [QUICK_ACTION_PARAM]: "record-violation" },
    permission: "record_violations",
  },
  {
    id: "submit-leave",
    labelKey: "submitLeave",
    icon: ClipboardList,
    path: "/leave-requests",
    // The leave type and the "mine" tab are where the create dialog lives.
    query: { type: "leave", tab: "mine", [QUICK_ACTION_PARAM]: "submit-leave" },
    permission: "submit_leave_requests",
  },
  {
    id: "show-duty-qr",
    labelKey: "showDutyQr",
    icon: domainIcons.qr,
    // The duty desk opens on its first QR, so no parameter is needed.
    path: "/duty",
    permission: "issue_scan_tokens",
  },
  {
    id: "add-visitor",
    labelKey: "addVisitor",
    icon: UserPlus,
    path: "/visitors/board",
    query: { [QUICK_ACTION_PARAM]: "add-visitor" },
    permission: "manage_visitors",
  },
  {
    id: "lend-book",
    labelKey: "lendBook",
    icon: BookOpen,
    // The loan desk opens in borrow mode with the scan field focused.
    path: "/library/desk",
    permission: "manage_library_circulation",
  },
  {
    id: "check-in",
    labelKey: "checkIn",
    icon: LogIn,
    // One deliberate tap on that page records the arrival or departure;
    // navigating never records anything by itself.
    path: "/check-in",
  },
  {
    id: "scan-qr",
    labelKey: "scanQr",
    icon: domainIcons.scan,
    path: "/scan",
  },
];

/** The href a quick action navigates to. */
export function quickActionHref(action: QuickAction): string {
  if (!action.query) return action.path;
  return `${action.path}?${new URLSearchParams(action.query).toString()}`;
}

/**
 * The quick actions a reader may perform: the action's own permission and
 * the target screen's route access (permission, profile kind, role
 * exclusions) must both pass, so the list can never offer a screen that
 * would refuse the reader.
 */
export function availableQuickActions(
  can: (permission: string) => boolean,
  profileKind: NavProfileKind | undefined,
  roleSlugs: string[] = [],
): QuickAction[] {
  return quickActions.filter(
    (action) =>
      (!action.permission || can(action.permission)) &&
      canOpenPath(action.path, can, profileKind, roleSlugs),
  );
}
