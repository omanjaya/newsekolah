import { domainIcons } from "@newsekolah/ui";
import {
  BookMarked,
  CalendarPlus,
  CalendarRange,
  Compass,
  DoorOpen,
  FileSpreadsheet,
  UsersRound,
} from "lucide-react";

import type { NavItem } from "./navigation";

/**
 * Academic master-data screens, split out of `navigation.ts` so that file
 * stays under the 400-line cap (docs/04-clean-code.md). Spread into the
 * `schoolData` group in `navigation.ts`, right after class promotion.
 */
export const academicNavItems: NavItem[] = [
  {
    key: "academic-years",
    labelKey: "nav.schoolData.items.academicYear",
    href: "/academic/years",
    icon: CalendarRange,
    permission: "view_academic_data",
    group: "nav.schoolData.label",
  },
  {
    key: "academic-grade-levels",
    labelKey: "nav.schoolData.items.gradeLevels",
    href: "/academic/grade-levels",
    icon: domainIcons.grades,
    permission: "manage_master_data",
    group: "nav.schoolData.label",
  },
  {
    key: "academic-tracks",
    labelKey: "nav.schoolData.items.tracks",
    href: "/academic/tracks",
    icon: Compass,
    permission: "manage_master_data",
    group: "nav.schoolData.label",
  },
  {
    key: "academic-rooms",
    labelKey: "nav.schoolData.items.rooms",
    href: "/academic/rooms",
    icon: DoorOpen,
    permission: "manage_master_data",
    group: "nav.schoolData.label",
  },
  {
    key: "academic-subject-offerings",
    labelKey: "nav.schoolData.items.subjectOfferings",
    href: "/academic/subject-offerings",
    icon: BookMarked,
    permission: "manage_master_data",
    group: "nav.schoolData.label",
  },
  {
    key: "academic-teaching-assignments",
    labelKey: "nav.schoolData.items.teachingAssignments",
    href: "/academic/teaching-assignments",
    icon: UsersRound,
    permission: "manage_master_data",
    group: "nav.schoolData.label",
  },
  {
    key: "academic-enrollment-import",
    labelKey: "nav.schoolData.items.enrollmentImport",
    href: "/academic/enrollment-import",
    icon: FileSpreadsheet,
    permission: "manage_enrollments",
    group: "nav.schoolData.label",
  },
  {
    key: "academic-new-year-setup",
    labelKey: "nav.schoolData.items.newYearSetup",
    href: "/academic/new-year-setup",
    icon: CalendarPlus,
    permission: "manage_master_data",
    group: "nav.schoolData.label",
  },
];
