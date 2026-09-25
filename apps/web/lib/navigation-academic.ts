import { Building2, CalendarPlus, CalendarRange, FileSpreadsheet } from "lucide-react";

import type { NavItem } from "./navigation";
import { NAV_GROUP } from "./navigation-groups";

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
    // Same reasoning as "school-classes" in navigation.ts: view_academic_data
    // is also a student's own permission, but year/term setup is a
    // master-data screen for staff.
    excludeProfileKinds: ["student"],
    group: NAV_GROUP.masterData,
  },
  {
    key: "school-structure",
    labelKey: "app.academic.structure.title",
    href: "/school/structure",
    icon: Building2,
    permission: "manage_master_data",
    group: NAV_GROUP.masterData,
  },
  {
    key: "academic-enrollment-import",
    labelKey: "nav.schoolData.items.enrollmentImport",
    href: "/academic/enrollment-import",
    icon: FileSpreadsheet,
    permission: "manage_enrollments",
    group: NAV_GROUP.masterData,
  },
  {
    key: "academic-new-year-setup",
    labelKey: "nav.schoolData.items.newYearSetup",
    href: "/academic/new-year-setup",
    icon: CalendarPlus,
    permission: "manage_master_data",
    group: NAV_GROUP.academic,
  },
];
