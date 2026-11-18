import type { CategoryTone } from "@newsekolah/ui";

import type { QuickAction, QuickActionId } from "./quick-actions";

/**
 * Quick actions, most frequent first: scanning happens every lesson or at
 * every gate pass, clocking in twice a day, the rest when the situation
 * comes up. Shared by the phone's quick-action sheet and the command
 * palette, so both list them in one order.
 */
const FREQUENCY: QuickActionId[] = [
  "scan-qr",
  "check-in",
  "show-duty-qr",
  "lend-book",
  "add-visitor",
  "record-violation",
  "submit-leave",
];

/** One topic hue per action, the way the stat tiles colour their icons. */
export const QUICK_ACTION_TONE: Record<QuickActionId, CategoryTone> = {
  "scan-qr": "green",
  "check-in": "blue",
  "show-duty-qr": "purple",
  "lend-book": "amber",
  "add-visitor": "blue",
  "record-violation": "red",
  "submit-leave": "amber",
};

export function sortQuickActions(actions: readonly QuickAction[]): QuickAction[] {
  return [...actions].sort((a, b) => FREQUENCY.indexOf(a.id) - FREQUENCY.indexOf(b.id));
}
