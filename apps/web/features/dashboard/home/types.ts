import type { components } from "@newsekolah/api-client";
import type { HeroCardTone, StatTileTone } from "@newsekolah/ui";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type Me = components["schemas"]["Me"];

export type PersonaKey =
  | "teacher"
  | "checkIn"
  | "homeroom"
  | "student"
  | "leadership"
  | "deputy"
  | "librarian"
  | "picket"
  | "counselor"
  | "gate";

export interface HeroLink {
  label: string;
  href: string;
}

export interface HeroCandidate {
  key: string;
  priority: number; // use HERO_PRIORITY
  eyebrow: string;
  title: string;
  meta?: string;
  chip?: string;
  /** The chip's dot pulses: something is running right now. */
  live?: boolean;
  /** `accent-soft` (default) when something waits; `neutral` for the calm state. */
  tone?: HeroCardTone;
  /** The one primary action. */
  action?: HeroLink;
  /** A quieter text link beside the primary action. */
  secondaryAction?: HeroLink;
  /** A meter under the meta line (attendance taken so far, for example). */
  progress?: { value: number; max: number; label: string; valueLabel: string };
  /**
   * Tile keys whose figure this hero already states. While it is the hero
   * those tiles are left out of the stat row, so one fact is said once.
   */
  coversTiles?: readonly string[];
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

/**
 * What one persona adds to the home: a hero candidate, stat tiles, and
 * cards. `main` cards are the persona's task queue (the wide column on a
 * desktop, straight under the stats on a phone); `side` cards are context
 * that supports it (the narrow column, after the queue on a phone).
 */
export interface PersonaBlock {
  hero?: HeroCandidate;
  tiles: TileSpec[];
  main: BlockSlot[];
  side: BlockSlot[];
  /** The queries behind the hero or the tiles are still loading. */
  pending?: boolean;
}

export const EMPTY_BLOCK: PersonaBlock = { tiles: [], main: [], side: [] };

/**
 * Hero urgency, highest wins (spec "Urutan prioritas hero"). Work waiting
 * on the reader comes first; the calm states (`*Idle`) only win when no
 * persona has anything pending, so every role still opens on a card with
 * one way forward.
 */
export const HERO_PRIORITY = {
  teacherNowPending: 100,
  studentNext: 90,
  leaveQueue: 80,
  picketQueue: 70,
  circulation: 60,
  inboxQueue: 55,
  schoolSummary: 50,
  teacherNext: 40,
  gateIdle: 34,
  picketIdle: 32,
  counselorIdle: 30,
  inboxIdle: 26,
  teacherIdle: 22,
  studentIdle: 20,
} as const;
