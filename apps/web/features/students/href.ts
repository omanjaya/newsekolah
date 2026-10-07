import type { StudentProfileTab } from "./lib/profile-tabs";

/** Link to one student's profile, optionally opening a specific tab. */
export function studentProfileHref(studentId: string, tab?: StudentProfileTab): string {
  const base = `/students/${encodeURIComponent(studentId)}`;
  return tab ? `${base}?tab=${tab}` : base;
}
