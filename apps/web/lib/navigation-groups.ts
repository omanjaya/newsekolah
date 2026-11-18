import {
  Boxes,
  BriefcaseBusiness,
  Building2,
  Database,
  GraduationCap,
  LibraryBig,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Group ids. Each is also the message key the group was first labelled
 * with, which is why existing stored preferences (collapsed groups) still
 * match; the label shown today comes from `navGroupLabelKey`.
 */
export const NAV_GROUP = {
  masterData: "app.navigation.masterData",
  academic: "nav.academic.label",
  students: "app.navigation.students",
  duty: "app.navigation.duty",
  staff: "app.navigation.staff",
  library: "nav.library.label",
  administration: "app.navigation.administration",
  settings: "nav.settings.label",
  platform: "nav.platform.label",
} as const;

export const navGroupOrder: string[] = [
  NAV_GROUP.academic,
  NAV_GROUP.students,
  NAV_GROUP.duty,
  NAV_GROUP.staff,
  NAV_GROUP.library,
  NAV_GROUP.administration,
  NAV_GROUP.masterData,
  NAV_GROUP.settings,
  NAV_GROUP.platform,
];

/**
 * One distinct glyph per group: the rail shows these side by side, so two
 * near-identical people icons (students and staff) read as one.
 */
export const navGroupIcons: Record<string, LucideIcon> = {
  [NAV_GROUP.academic]: GraduationCap,
  [NAV_GROUP.students]: UsersRound,
  [NAV_GROUP.duty]: ShieldCheck,
  [NAV_GROUP.staff]: BriefcaseBusiness,
  [NAV_GROUP.library]: LibraryBig,
  [NAV_GROUP.administration]: Building2,
  [NAV_GROUP.masterData]: Database,
  [NAV_GROUP.settings]: Settings,
  [NAV_GROUP.platform]: Boxes,
};

/** Sentence-case group labels from the shell catalog (app.shell.nav.groups). */
const NAV_GROUP_LABEL_KEYS: Record<string, string> = {
  [NAV_GROUP.academic]: "app.shell.nav.groups.academic",
  [NAV_GROUP.students]: "app.shell.nav.groups.students",
  [NAV_GROUP.duty]: "app.shell.nav.groups.duty",
  [NAV_GROUP.staff]: "app.shell.nav.groups.staff",
  [NAV_GROUP.library]: "app.shell.nav.groups.library",
  [NAV_GROUP.administration]: "app.shell.nav.groups.administration",
  [NAV_GROUP.masterData]: "app.shell.nav.groups.masterData",
  [NAV_GROUP.settings]: "app.shell.nav.groups.settings",
  [NAV_GROUP.platform]: "app.shell.nav.groups.platform",
};

/** The message key to label a group with; an unknown group falls back to its own id. */
export function navGroupLabelKey(group: string): string {
  return NAV_GROUP_LABEL_KEYS[group] ?? group;
}
