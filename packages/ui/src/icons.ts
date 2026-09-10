import {
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClockAlert,
  DoorOpen,
  FileText,
  GraduationCap,
  Megaphone,
  QrCode,
  ScanLine,
  Settings,
  ShieldAlert,
  UserCheck,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/**
 * One Lucide icon per domain concept, so the same concept never renders two
 * different glyphs across web and mobile. See docs/07-ui-ux.md section 7:
 * "Peta ikon per konsep disimpan di packages/ui/icons.ts agar tidak ada dua
 * ikon untuk satu konsep." Add new concepts here rather than importing
 * lucide-react directly in feature code.
 */
export const domainIcons = {
  attendance: CalendarCheck,
  qr: QrCode,
  scan: ScanLine,
  exitPermit: DoorOpen,
  late: ClockAlert,
  library: BookOpen,
  violation: ShieldAlert,
  announcement: Megaphone,
  settings: Settings,
  users: Users,
  schedule: CalendarDays,
  grades: GraduationCap,
  document: FileText,
  workflow: Workflow,
  visitor: UserCheck,
  incident: AlertTriangle,
} satisfies Record<string, LucideIcon>;

export type DomainIconName = keyof typeof domainIcons;
