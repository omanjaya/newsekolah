import { PROTECTED_BULK_TOKENS, statusToken } from "./status-tokens";

/**
 * Which students a "mark everyone present" bulk action should update,
 * given their current status and whether each is blocked
 * (leave/permit-sourced, already locked). Skips a blocked row and any row
 * already on a protected status (sick, excused, dispensation) so the bulk
 * action never erases a recorded exception; an unmarked absence is not
 * protected and is swept back to present like everyone else.
 */
export function studentsToMarkPresent(
  roster: { student_user_id: string; blocked?: boolean }[],
  currentStatuses: Record<string, string>,
  defaultCode: string,
): string[] {
  const ids: string[] = [];
  for (const item of roster) {
    if (item.blocked) continue;
    const current = currentStatuses[item.student_user_id] ?? defaultCode;
    const token = statusToken(current);
    if (token && PROTECTED_BULK_TOKENS.has(token)) continue;
    ids.push(item.student_user_id);
  }
  return ids;
}
