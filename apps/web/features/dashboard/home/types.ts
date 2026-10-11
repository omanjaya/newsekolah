import type { components } from "@newsekolah/api-client";
import type { StatTileTone } from "@newsekolah/ui";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type Me = components["schemas"]["Me"];

export type PersonaKey =
  | "teacher"
  | "checkIn"
  | "homeroom"
  | "student"
  | "leadership"
  | "librarian"
  | "picket"
  | "counselor";

export interface HeroCandidate {
  key: string;
  priority: number; // use HERO_PRIORITY
  eyebrow: string;
  title: string;
  meta?: string;
  chip?: string;
  action?: { label: string; href: string };
}

export interface TileSpec {
  key: string; // unique across personas, e.g. "teacher.pending"
  priority: number; // higher first
  label: string;
  value: string;
  hint?: string;
  href?: string;
  icon: LucideIcon;
  tone: StatTileTone;
}

export interface BlockSlot {
  key: string;
  node: ReactNode;
}

export interface PersonaBlock {
  hero?: HeroCandidate;
  tiles: TileSpec[];
  left: BlockSlot[];
  right: BlockSlot[];
}

export const EMPTY_BLOCK: PersonaBlock = { tiles: [], left: [], right: [] };

/** Hero urgency, highest wins (spec "Urutan prioritas hero"). */
export const HERO_PRIORITY = {
  teacherNowPending: 100,
  studentNext: 90,
  leaveQueue: 80,
  picketQueue: 70,
  circulation: 60,
  schoolSummary: 50,
  teacherNext: 40,
} as const;
