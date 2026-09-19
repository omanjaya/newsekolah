import {
  BookOpen,
  Boxes,
  Building2,
  Database,
  GraduationCap,
  Settings,
  Users,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const NAV_GROUP = {
  masterData: "app.navigation.masterData",
  academic: "nav.academic.label",
  students: "app.navigation.students",
  staff: "app.navigation.staff",
  library: "nav.library.label",
  administration: "app.navigation.administration",
  settings: "nav.settings.label",
  platform: "nav.platform.label",
} as const;

export const navGroupOrder: string[] = Object.values(NAV_GROUP);

export const navGroupIcons: Record<string, LucideIcon> = {
  [NAV_GROUP.academic]: GraduationCap,
  [NAV_GROUP.students]: UsersRound,
  [NAV_GROUP.staff]: Users,
  [NAV_GROUP.library]: BookOpen,
  [NAV_GROUP.administration]: Building2,
  [NAV_GROUP.masterData]: Database,
  [NAV_GROUP.settings]: Settings,
  [NAV_GROUP.platform]: Boxes,
};
