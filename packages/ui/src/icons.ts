import {
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  ClockAlert,
  DoorOpen,
  FileText,
  FileWarning,
  GraduationCap,
  Handshake,
  Megaphone,
  QrCode,
  Receipt,
  ScanLine,
  Settings,
  ShieldAlert,
  UserCheck,
  Users,
  Wallet,
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
  /** A leave request (izin tidak masuk), apart from the exit permit's door. */
  leave: ClipboardList,
  late: ClockAlert,
  library: BookOpen,
  violation: ShieldAlert,
  /** A warning letter (surat peringatan), apart from the violation's shield. */
  warningLetter: FileWarning,
  announcement: Megaphone,
  settings: Settings,
  users: Users,
  schedule: CalendarDays,
  grades: GraduationCap,
  document: FileText,
  workflow: Workflow,
  visitor: UserCheck,
  incident: AlertTriangle,
  billing: Wallet,
  receipt: Receipt,
  mentoring: Handshake,
  supervision: ClipboardCheck,
} satisfies Record<string, LucideIcon>;

export type DomainIconName = keyof typeof domainIcons;
