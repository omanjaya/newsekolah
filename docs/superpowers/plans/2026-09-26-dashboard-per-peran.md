# Beranda web per peran Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single permission-driven web dashboard with a combined per-role home (layout A, Hijau Segar) built from persona blocks.

**Architecture:** Every persona has one hook `use<Persona>Block(me, active)` returning a `PersonaBlock` (hero candidate, stat tiles, left/right column nodes). `resolvePersonas(me)` decides which personas are active; `dashboard-view.tsx` calls every block hook, picks one hero via `pickHero`, the top 4 tiles via `mergeTiles`, and stacks the column nodes. Two new shared components in `packages/ui`: `HeroCard`, `StatTile`.

**Tech Stack:** Next.js (App Router, client components), React Query, next-intl, Tailwind v4 with the token preset, Vitest + Testing Library, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-26-dashboard-per-peran-design.md`

## Global Constraints

- Work on branch `feat/dashboard-redesign`. Each agent's first command: `git merge --ff-only feat/dashboard-redesign` (or `git reset --hard feat/dashboard-redesign` if the worktree has no commits yet), then confirm `docs/superpowers/plans/2026-09-26-dashboard-per-peran.md` exists.
- Code and commits in English; user-facing text only through next-intl, Indonesian (`*.id.json`) is the default, English (`*.en.json`) must have the same keys.
- No emoji anywhere. Icons from `lucide-react` only.
- Colors only via token utilities (`bg-surface`, `text-fg-muted`, `bg-accent-soft`, `text-accent-soft-fg`, `bg-category-<hue>-soft`, `text-category-<hue>-soft-fg`, `border-border`, ...). No hex values in components. Card borders keep `border border-border` (no token changes).
- Headings/numbers in the hero and tiles use `font-heading` (Manrope); body stays default (Plus Jakarta Sans).
- Every query in a block is disabled when the persona is inactive (pass `enabled`), so no 403 reaches the first screen.
- No new backend endpoints.
- Validation per task: `pnpm --filter @newsekolah/web typecheck && pnpm --filter @newsekolah/web lint && pnpm --filter @newsekolah/web test` (plus the same for `@newsekolah/ui` in Task 1). Commit messages follow conventional commits and end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Read `docs/03-layered-architecture.md` and `docs/04-clean-code.md` before starting.

## Execution waves

- Wave 1 (parallel): Task 1, Task 2.
- Wave 2 (parallel, after wave 1 is merged into `feat/dashboard-redesign`): Task 3, 4, 5, 6.
- Wave 3: Task 7.

---

### Task 1: `HeroCard` and `StatTile` in `packages/ui`

**Files:**

- Create: `packages/ui/src/components/hero-card.tsx`, `packages/ui/src/components/hero-card.stories.tsx`, `packages/ui/src/components/hero-card.test.tsx`
- Create: `packages/ui/src/components/stat-tile.tsx`, `packages/ui/src/components/stat-tile.stories.tsx`, `packages/ui/src/components/stat-tile.test.tsx`
- Modify: `packages/ui/src/index.ts` (add exports next to `Stat`)

**Interfaces:**

- Produces:

  ```ts
  export interface HeroCardProps {
    eyebrow: string; // small uppercase label, e.g. "Sekarang"
    title: string; // Manrope 24-26px
    meta?: string; // one line under the title
    chip?: string; // pill on the right of the eyebrow, e.g. "12 menit lagi"
    action?: ReactNode; // usually <Button asChild><Link/></Button>
    className?: string;
  }
  export function HeroCard(props: HeroCardProps): ReactElement;

  export type StatTileTone = "green" | "amber" | "purple" | "blue" | "red";
  export interface StatTileProps {
    icon: LucideIcon;
    tone: StatTileTone;
    value: ReactNode;
    label: string;
    hint?: string;
    className?: string;
  }
  export function StatTile(props: StatTileProps): ReactElement;
  ```

- [ ] **Step 1: Write failing tests** (`hero-card.test.tsx`, `stat-tile.test.tsx`), following `button.test.tsx` (uses `expectNoAxeViolations` from `../test/axe.js`):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../test/axe.js";
import { HeroCard } from "./hero-card.js";

describe("HeroCard", () => {
  it("renders eyebrow, title as a heading, meta, chip and action", async () => {
    const { container } = render(
      <HeroCard
        eyebrow="Sekarang"
        title="Matematika · X-A"
        meta="08.40-10.00"
        chip="12 menit lagi"
        action={<a href="/attendance">Isi presensi</a>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Matematika · X-A" })).toBeInTheDocument();
    expect(screen.getByText("Sekarang")).toBeInTheDocument();
    expect(screen.getByText("08.40-10.00")).toBeInTheDocument();
    expect(screen.getByText("12 menit lagi")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Isi presensi" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("omits optional parts", () => {
    render(<HeroCard eyebrow="Hari ini" title="Tidak ada jadwal" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
```

```tsx
import { render, screen } from "@testing-library/react";
import { CalendarCheck } from "lucide-react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../test/axe.js";
import { StatTile } from "./stat-tile.js";

describe("StatTile", () => {
  it("shows value, label and hint, icon hidden from assistive tech", async () => {
    const { container } = render(
      <StatTile icon={CalendarCheck} tone="green" value="96%" label="Kehadiran" hint="bulan ini" />,
    );
    expect(screen.getByText("96%")).toBeInTheDocument();
    expect(screen.getByText("Kehadiran")).toBeInTheDocument();
    expect(screen.getByText("bulan ini")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await expectNoAxeViolations(container);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @newsekolah/ui test -- hero-card stat-tile` -> FAIL (modules missing).

- [ ] **Step 3: Implement.**

```tsx
// hero-card.tsx
import type { ReactElement, ReactNode } from "react";
import { cn } from "../utils/cn.js";

export interface HeroCardProps {
  eyebrow: string;
  title: string;
  meta?: string;
  chip?: string;
  action?: ReactNode;
  className?: string;
}

/** The "right now" card that opens a home screen: accent-soft surface, one primary action. */
export function HeroCard({
  eyebrow,
  title,
  meta,
  chip,
  action,
  className,
}: HeroCardProps): ReactElement {
  return (
    <section
      className={cn(
        "flex flex-col gap-2 rounded-lg bg-accent-soft px-5 py-5 text-accent-soft-fg md:px-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-bold tracking-wide uppercase">{eyebrow}</span>
        {chip && (
          <span className="rounded-full bg-accent px-2.5 py-1 text-[12px] font-bold text-accent-fg">
            {chip}
          </span>
        )}
      </div>
      <h2 className="font-heading text-[24px] leading-tight font-bold tracking-tight md:text-[26px]">
        {title}
      </h2>
      {meta && <p className="text-[14px]">{meta}</p>}
      {action && <div className="mt-1">{action}</div>}
    </section>
  );
}
```

```tsx
// stat-tile.tsx
import type { LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "../utils/cn.js";

export type StatTileTone = "green" | "amber" | "purple" | "blue" | "red";
export interface StatTileProps {
  icon: LucideIcon;
  tone: StatTileTone;
  value: ReactNode;
  label: string;
  hint?: string;
  className?: string;
}

// Full class names so Tailwind's scanner generates them.
const TONE: Record<StatTileTone, string> = {
  green: "bg-category-green-soft text-category-green-soft-fg",
  amber: "bg-category-amber-soft text-category-amber-soft-fg",
  purple: "bg-category-purple-soft text-category-purple-soft-fg",
  blue: "bg-category-blue-soft text-category-blue-soft-fg",
  red: "bg-category-red-soft text-category-red-soft-fg",
};

/** One number on a home screen: topic icon in a soft circle, Manrope value, label. */
export function StatTile({
  icon: Icon,
  tone,
  value,
  label,
  hint,
  className,
}: StatTileProps): ReactElement {
  return (
    <div
      className={cn(
        "flex min-h-[104px] flex-col gap-3 rounded-lg border border-border bg-surface p-4",
        className,
      )}
    >
      <span className={cn("flex size-9 items-center justify-center rounded-full", TONE[tone])}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="flex flex-col">
        <span className="font-heading text-[22px] leading-tight font-bold tabular-nums text-fg">
          {value}
        </span>
        <span className="text-[13px] text-fg">{label}</span>
        {hint && <span className="text-[12px] text-fg-muted">{hint}</span>}
      </div>
    </div>
  );
}
```

Add stories mirroring `stat.stories.tsx` (one default story each, a StatTile row of all five tones). Export both from `index.ts`:

```ts
export { HeroCard, type HeroCardProps } from "./components/hero-card.js";
export { StatTile, type StatTileProps, type StatTileTone } from "./components/stat-tile.js";
```

- [ ] **Step 4: Run** `pnpm --filter @newsekolah/ui test && pnpm --filter @newsekolah/ui typecheck && pnpm --filter @newsekolah/ui lint` -> PASS.
- [ ] **Step 5: Commit** `feat(ui): add HeroCard and StatTile for home screens`.

---

### Task 2: Dashboard home core (types, personas, composition, time helpers)

**Files:**

- Create: `apps/web/features/dashboard/home/types.ts`
- Create: `apps/web/features/dashboard/home/personas.ts`, `personas.test.ts`
- Create: `apps/web/features/dashboard/home/compose.ts`, `compose.test.ts`
- Create: `apps/web/features/dashboard/home/time.ts`, `time.test.ts`

**Interfaces:**

- Produces (exact):

```ts
// types.ts
import type { components } from "@newsekolah/api-client";
import type { StatTileTone } from "@newsekolah/ui";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type Me = components["schemas"]["Me"];
export type PersonaKey =
  "teacher" | "homeroom" | "student" | "leadership" | "librarian" | "picket" | "counselor";

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
```

```ts
// personas.ts
export function resolvePersonas(me: Me): Set<PersonaKey>;
// compose.ts
export function pickHero(candidates: HeroCandidate[]): HeroCandidate | undefined;
export function mergeTiles(tiles: TileSpec[], max?: number): TileSpec[]; // default max 4
export function collectBlocks(blocks: PersonaBlock[]): {
  hero?: HeroCandidate;
  tiles: TileSpec[];
  left: BlockSlot[];
  right: BlockSlot[];
};
// time.ts
export function minutesInZone(now: Date, timeZone: string): number; // minutes since local midnight in timeZone
export function parseClock(value: string): number; // "08:40" | "08:40:00" -> 520
export function isoWeekdayInZone(now: Date, timeZone: string): number; // Monday=1 .. Sunday=7
export interface TimeRange {
  start: number;
  end: number;
}
export function pickCurrentOrNext<T extends TimeRange>(
  items: T[],
  nowMinutes: number,
): { item: T; state: "now" | "next" } | undefined;
export function attendanceRate(
  statuses: ReadonlyArray<string | null | undefined>,
  attended: ReadonlyArray<string>,
): number | undefined; // rounded percent
```

Persona rules (`resolvePersonas`):

- `teacher`: `me.profile_kind === "teacher"` and `me.permissions` includes `manage_attendance`.
- `homeroom`: `me.duties` has slug `homeroom`.
- `student`: `me.profile_kind === "student"`.
- `leadership`: a role slug in `admin`, `super_admin`, `principal`.
- `librarian`: permissions include `manage_library_circulation`.
- `picket`: duties has slug `picket`, or permissions include `issue_scan_tokens`.
- `counselor`: duties has slug `counselor`.

- [ ] **Step 1: Write failing tests.**

```ts
// personas.test.ts
import { describe, expect, it } from "vitest";
import { resolvePersonas } from "./personas";
import type { Me } from "./types";

const base = {
  id: "u",
  username: "u",
  name: "U",
  roles: [],
  permissions: [],
  must_change_password: false,
  tenant: {},
} as unknown as Me;
const me = (patch: Partial<Me>): Me => ({ ...base, ...patch }) as Me;

describe("resolvePersonas", () => {
  it("combines teacher and homeroom for a homeroom teacher", () => {
    const p = resolvePersonas(
      me({
        profile_kind: "teacher",
        permissions: ["manage_attendance"],
        duties: [{ slug: "homeroom", scope_kind: "class", scope_id: "c1", scope_label: "X-A" }],
      }),
    );
    expect([...p].sort()).toEqual(["homeroom", "teacher"]);
  });
  it("does not treat a picket staff member as a teacher", () => {
    const p = resolvePersonas(
      me({
        profile_kind: "staff",
        permissions: ["manage_attendance"],
        duties: [{ slug: "picket", scope_kind: "school" }],
      }),
    );
    expect([...p]).toEqual(["picket"]);
  });
  it("recognises a student", () => {
    expect([...resolvePersonas(me({ profile_kind: "student" }))]).toEqual(["student"]);
  });
  it("maps admin and principal roles to leadership", () => {
    expect(
      resolvePersonas(
        me({ roles: [{ id: "r", slug: "principal", name: "Kepala Sekolah" }] as Me["roles"] }),
      ).has("leadership"),
    ).toBe(true);
    expect(
      resolvePersonas(
        me({ roles: [{ id: "r", slug: "admin", name: "Admin" }] as Me["roles"] }),
      ).has("leadership"),
    ).toBe(true);
  });
  it("detects librarian and counselor", () => {
    const p = resolvePersonas(
      me({
        permissions: ["manage_library_circulation"],
        duties: [{ slug: "counselor", scope_kind: "school" }],
      }),
    );
    expect([...p].sort()).toEqual(["counselor", "librarian"]);
  });
  it("returns nothing for a parent", () => {
    expect(resolvePersonas(me({ profile_kind: "parent" })).size).toBe(0);
  });
});
```

```ts
// compose.test.ts
import { CalendarCheck } from "lucide-react";
import { describe, expect, it } from "vitest";
import { collectBlocks, mergeTiles, pickHero } from "./compose";
import { HERO_PRIORITY, type TileSpec } from "./types";

const tile = (key: string, priority: number): TileSpec => ({
  key,
  priority,
  label: key,
  value: "1",
  icon: CalendarCheck,
  tone: "green",
});

describe("pickHero", () => {
  it("returns the highest priority candidate", () => {
    const hero = pickHero([
      { key: "a", priority: HERO_PRIORITY.schoolSummary, eyebrow: "", title: "a" },
      { key: "b", priority: HERO_PRIORITY.teacherNowPending, eyebrow: "", title: "b" },
    ]);
    expect(hero?.key).toBe("b");
  });
  it("returns undefined for no candidates", () => expect(pickHero([])).toBeUndefined());
});

describe("mergeTiles", () => {
  it("keeps the top four by priority, stable on ties, deduped by key", () => {
    const out = mergeTiles([
      tile("a", 1),
      tile("b", 5),
      tile("c", 5),
      tile("b", 9),
      tile("d", 3),
      tile("e", 2),
    ]);
    expect(out.map((t) => t.key)).toEqual(["b", "c", "d", "e"]);
  });
});

describe("collectBlocks", () => {
  it("stacks columns in block order and picks one hero", () => {
    const out = collectBlocks([
      { tiles: [tile("x", 1)], left: [{ key: "l1", node: null }], right: [] },
      {
        hero: { key: "h", priority: 1, eyebrow: "", title: "h" },
        tiles: [],
        left: [{ key: "l2", node: null }],
        right: [{ key: "r1", node: null }],
      },
    ]);
    expect(out.hero?.key).toBe("h");
    expect(out.left.map((s) => s.key)).toEqual(["l1", "l2"]);
    expect(out.right.map((s) => s.key)).toEqual(["r1"]);
    expect(out.tiles.map((t) => t.key)).toEqual(["x"]);
  });
});
```

```ts
// time.test.ts
import { describe, expect, it } from "vitest";
import {
  attendanceRate,
  isoWeekdayInZone,
  minutesInZone,
  parseClock,
  pickCurrentOrNext,
} from "./time";

describe("time helpers", () => {
  it("reads minutes in the tenant zone", () => {
    // 2026-09-26T01:40:00Z is 08:40 in Asia/Jakarta (UTC+7)
    expect(minutesInZone(new Date("2026-09-26T01:40:00Z"), "Asia/Jakarta")).toBe(520);
  });
  it("gives ISO weekday in zone", () => {
    // Saturday 26 Sep 2026 in Jakarta
    expect(isoWeekdayInZone(new Date("2026-09-26T01:40:00Z"), "Asia/Jakarta")).toBe(6);
    // Sunday 00:30 Jakarta is still Saturday in UTC
    expect(isoWeekdayInZone(new Date("2026-09-26T17:30:00Z"), "Asia/Jakarta")).toBe(7);
  });
  it("parses clock strings", () => {
    expect(parseClock("08:40")).toBe(520);
    expect(parseClock("08:40:00")).toBe(520);
  });
  it("picks the running item, else the next one", () => {
    const items = [
      { id: 1, start: 420, end: 500 },
      { id: 2, start: 520, end: 600 },
    ];
    expect(pickCurrentOrNext(items, 530)).toEqual({ item: items[1], state: "now" });
    expect(pickCurrentOrNext(items, 505)).toEqual({ item: items[1], state: "next" });
    expect(pickCurrentOrNext(items, 610)).toBeUndefined();
  });
  it("computes attendance rate over days that have a status", () => {
    expect(attendanceRate(["present", "late", "sick", null, "absent"], ["present", "late"])).toBe(
      50,
    );
    expect(attendanceRate([null, undefined], ["present"])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @newsekolah/web test -- features/dashboard/home` -> FAIL.

- [ ] **Step 3: Implement.** `types.ts` exactly as above. Then:

```ts
// personas.ts
import type { Me, PersonaKey } from "./types";

const LEADERSHIP_ROLES = new Set(["admin", "super_admin", "principal"]);

/** Which home-screen personas the signed-in user holds; a user may hold several. */
export function resolvePersonas(me: Me): Set<PersonaKey> {
  const personas = new Set<PersonaKey>();
  const can = (code: string) => me.permissions.includes(code);
  const hasDuty = (slug: string) => (me.duties ?? []).some((duty) => duty.slug === slug);
  if (me.profile_kind === "teacher" && can("manage_attendance")) personas.add("teacher");
  if (hasDuty("homeroom")) personas.add("homeroom");
  if (me.profile_kind === "student") personas.add("student");
  if (me.roles.some((role) => LEADERSHIP_ROLES.has(role.slug))) personas.add("leadership");
  if (can("manage_library_circulation")) personas.add("librarian");
  if (hasDuty("picket") || can("issue_scan_tokens")) personas.add("picket");
  if (hasDuty("counselor")) personas.add("counselor");
  return personas;
}
```

```ts
// compose.ts
import type { BlockSlot, HeroCandidate, PersonaBlock, TileSpec } from "./types";

export function pickHero(candidates: HeroCandidate[]): HeroCandidate | undefined {
  return candidates.reduce<HeroCandidate | undefined>(
    (best, c) => (!best || c.priority > best.priority ? c : best),
    undefined,
  );
}

export function mergeTiles(tiles: TileSpec[], max = 4): TileSpec[] {
  const byKey = new Map<string, TileSpec>();
  for (const tile of tiles) {
    const seen = byKey.get(tile.key);
    if (!seen || tile.priority > seen.priority) byKey.set(tile.key, tile);
  }
  return [...byKey.values()].sort((a, b) => b.priority - a.priority).slice(0, max);
}

export function collectBlocks(blocks: PersonaBlock[]): {
  hero?: HeroCandidate;
  tiles: TileSpec[];
  left: BlockSlot[];
  right: BlockSlot[];
} {
  return {
    hero: pickHero(blocks.flatMap((b) => (b.hero ? [b.hero] : []))),
    tiles: mergeTiles(blocks.flatMap((b) => b.tiles)),
    left: blocks.flatMap((b) => b.left),
    right: blocks.flatMap((b) => b.right),
  };
}
```

Note on `mergeTiles` expected order in the test: after dedupe `b` has priority 9 and keeps its first insertion position; `Array.prototype.sort` is stable, so `c`(5) precedes `d`(3), `e`(2). Adjust nothing else.

```ts
// time.ts
function zoneParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { hour: Number(get("hour")), minute: Number(get("minute")), weekday: get("weekday") };
}

export function minutesInZone(now: Date, timeZone: string): number {
  const { hour, minute } = zoneParts(now, timeZone);
  return hour * 60 + minute;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function isoWeekdayInZone(now: Date, timeZone: string): number {
  return WEEKDAYS.indexOf(zoneParts(now, timeZone).weekday) + 1;
}

export function parseClock(value: string): number {
  const [h = "0", m = "0"] = value.split(":");
  return Number(h) * 60 + Number(m);
}

export interface TimeRange {
  start: number;
  end: number;
}

export function pickCurrentOrNext<T extends TimeRange>(
  items: T[],
  nowMinutes: number,
): { item: T; state: "now" | "next" } | undefined {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const running = sorted.find((i) => i.start <= nowMinutes && nowMinutes < i.end);
  if (running) return { item: running, state: "now" };
  const next = sorted.find((i) => i.start > nowMinutes);
  return next ? { item: next, state: "next" } : undefined;
}

export function attendanceRate(
  statuses: ReadonlyArray<string | null | undefined>,
  attended: ReadonlyArray<string>,
): number | undefined {
  const known = statuses.filter((s): s is string => Boolean(s));
  if (known.length === 0) return undefined;
  return Math.round((known.filter((s) => attended.includes(s)).length / known.length) * 100);
}
```

- [ ] **Step 4: Run** `pnpm --filter @newsekolah/web test -- features/dashboard/home && pnpm --filter @newsekolah/web typecheck && pnpm --filter @newsekolah/web lint` -> PASS. (Task 1 may not be merged yet in this worktree: if `StatTileTone` is not exported from `@newsekolah/ui`, declare `type StatTileTone = "green" | "amber" | "purple" | "blue" | "red"` locally in `types.ts` with a comment; the merge step will switch it to the import.)
- [ ] **Step 5: Commit** `feat(web): add dashboard home persona and composition core`.

---

### Shared rules for block tasks (3-6)

Each block file lives in `apps/web/features/dashboard/home/blocks/` and exports one hook with this exact shape:

```ts
export function use<Name>Block(me: Me, active: boolean): PersonaBlock
```

- Call every React Query hook unconditionally with `enabled: active && ...`; return `EMPTY_BLOCK` when `!active`.
- `hero` and `tiles` only when the underlying data has loaded successfully (never show "0" while loading or on error).
- `left`/`right` slots are rendered React nodes. Each block card uses `Card` from `@newsekolah/ui` with `CardHeader`/`CardTitle` and shows: `Skeleton` while loading, `QueryError` (`apps/web/components/query-error`) with retry on error, a short empty sentence when empty.
- Links use `next/link`; hero actions become `{ label, href }` (the view renders the button).
- Copy goes into a new feature catalog `apps/web/messages/features/<namespace>.{id,en}.json`, registered in `apps/web/messages/features/index.ts` (import + `register...` entry, same pattern as `dashboardPersona`) and listed in `APP_FEATURE_NAMESPACES` in `apps/web/lib/i18n/namespace-sets.ts`. Use `useTranslations("app.<namespace>")`.
- Tests: `blocks/<name>.test.tsx`, mocking the API modules with `vi.mock` and `next-intl` as in `apps/web/features/dashboard/components/admin-dashboard-panel.test.tsx`, rendering the hook via `renderHook` from `@testing-library/react` and rendering returned slot nodes with `render(<>{block.left.map((s) => s.node)}</>)`.
- Reuse existing formatting components where they fit (e.g. `today-sessions-card.tsx` logic, `login-activity-chart.tsx`) by moving code, not duplicating; the old files are deleted in Task 7, so move what you reuse into your block file or a sibling file under `home/blocks/`.

### Task 3: Teacher and homeroom blocks

**Files:** Create `home/blocks/teacher.tsx`, `home/blocks/teacher.test.tsx`, `home/blocks/homeroom.tsx`, `home/blocks/homeroom.test.tsx`, catalog `dashboardTeaching.{id,en}.json`.

**Interfaces:** Consumes Task 2 types, `pickCurrentOrNext`, `minutesInZone`, `parseClock`, `HERO_PRIORITY`. Produces `useTeacherBlock(me, active)`, `useHomeroomBlock(me, active)`.

Data:

- Teacher: `useTodaySessionsQuery({ date: todayInZone(me.tenant.timezone) }, active)` from `features/attendance/api.ts`; times via `useAllPeriodsQuery(active)` (`features/reference/api.ts`), mapping `start_period_id`/`end_period_id` to `starts_at`/`ends_at`; names via `useClassesQuery(active)`, `useSubjectsQuery(active)`, `useLookup`. Follow how `features/dashboard/components/today-sessions-card.tsx` resolves names today.
- Homeroom: class from `me.duties.find(d => d.slug === "homeroom")` (`scope_id`, `scope_label`); `useHomeroomAttendanceQuery` (find it in `features/homeroom/`; today's date) for `total` and `status_counts`; `useLeaveReviewQueueQuery(active)` from `features/permits/api.ts`.

Output:

- Teacher hero: running session not submitted -> `HERO_PRIORITY.teacherNowPending`, eyebrow "Sekarang", title "{subject} · {class}", meta "{start}-{end} · presensi belum dikirim", chip "berjalan {n} menit", action "Isi presensi" -> `/attendance`. Otherwise next session today -> `HERO_PRIORITY.teacherNext`, eyebrow "Berikutnya", chip "{n} menit lagi", action "Buka presensi".
- Teacher tile: `teacher.pending` priority 90, value = sessions without `submitted_at`, hint "dari {total} sesi hari ini", icon `ClipboardCheck`, tone `green`, href `/attendance`.
- Teacher left slot `teacher.today`: card "Mengajar hari ini" listing each session (time, class, subject, status badge "Tersimpan"/"Belum diisi", the running one highlighted with `text-accent`), header action link "Buka presensi".
- Homeroom hero (only if queue non-empty): `HERO_PRIORITY.leaveQueue`, eyebrow "Wali kelas {class}", title "{n} izin menunggu tinjauan", action "Tinjau izin" -> `/leave-requests`.
- Homeroom tiles: `homeroom.leave` priority 85 (tone `amber`, icon `FileClock`, href `/leave-requests`), `homeroom.rate` priority 70 (value "{rate}%", hint "hadir {class} hari ini", tone `blue`, icon `Users`, computed as present+late over total from `status_counts`; omit if total is 0).
- Homeroom left slot `homeroom.class`: card "Wali kelas {class}": first 5 pending requests (student name, type, "Tinjau" link) and a row of status counts.

Tests (write first, then implement): inactive returns `EMPTY_BLOCK` and every query hook was called with `enabled=false`; running unsubmitted session yields `teacherNowPending` hero with `/attendance`; all submitted and none upcoming yields no hero; pending tile counts only unsubmitted; loading yields no tiles; homeroom rate is 50 for `{present: 1, late: 1, absent: 2}` total 4; empty queue gives no homeroom hero.

Commit: `feat(web): add teacher and homeroom home blocks`.

### Task 4: Student block

**Files:** Create `home/blocks/student.tsx`, `home/blocks/student.test.tsx`, catalog `dashboardStudent.{id,en}.json`.

**Interfaces:** Consumes Task 2 (`pickCurrentOrNext`, `minutesInZone`, `isoWeekdayInZone`, `parseClock`, `attendanceRate`, `HERO_PRIORITY`). Produces `useStudentBlock(me, active)`.

Data:

- Today's lessons: `useSchedulesQuery` (`features/schedule/api.ts`) with `academic_year_id: me.active_academic_year?.id`, `class_id: me.current_class?.id`, `day_of_week: isoWeekdayInZone(new Date(), tz)`; check the hook's filter type and how it signals `enabled`; if it has no `enabled` flag, pass the filter only when active (read the hook first). Map `start_period_id`/`end_period_id` (or `start_seq`/`end_seq` for blocks) to times using `useAllPeriodsQuery(active)`. Subject names `useSubjectsQuery(active)` + `useLookup`; teacher names `useTeachersQuery(active)`.
- Attendance %: `useMyCalendarQuery(currentMonth)` (find in `features/attendance/`); read the day status field and the status enum from `packages/api-client/src/gen/schema.d.ts`; attended statuses = present and late (use the enum's actual values).
- Leave: `useMyLeaveRequestsQuery` (`features/permits/api.ts`): count with a non-final status.
- Grades: `useMyGradesQuery` (`features/grading/api.ts`): count of published entries; hint "nilai terbit".
- Library: `useMyLibraryProfileQuery` (`features/library/me-api.ts`): `active_loans` length and nearest due date.

Output:

- Hero `HERO_PRIORITY.studentNext`: eyebrow "Sedang berlangsung"/"Pelajaran berikutnya", title subject, meta "{start}-{end} · {teacher}", chip "{n} menit lagi" for next, action "Lihat jadwal" -> `/schedule` (verify the student route exists in `apps/web/app/(app)`; else omit action). No lesson left today: no hero.
- Tiles: `student.attendance` 90 (`CalendarCheck`, green, "{rate}%", "kehadiran bulan ini"), `student.leave` 80 (`FileText`, amber, href `/leave-requests`), `student.loans` 70 (`BookOpen`, purple, href `/library/me` or the actual student library route), `student.grades` 60 (`GraduationCap`, blue, href to the grades route).
- Left: `student.schedule` card "Jadwal hari ini" as a vertical timeline (time, subject, teacher; past items `text-fg-muted`, current `text-accent font-bold`); `student.leave` card "Izin saya" (latest 3 with status badge, action link "Ajukan izin").
- Right: `student.library` card "Perpustakaan" (active loans with due date; overdue in `text-danger`).

Tests first: inactive -> `EMPTY_BLOCK` with disabled queries; next lesson chosen at 08:30 given lessons 07:00-08:20 and 08:40-10:00 (state next, chip minutes 10); rate 75 for 3 attended of 4; no loans -> library card empty sentence; loading -> no tiles.

Commit: `feat(web): add student home block`.

### Task 5: Leadership (admin/principal) and librarian blocks

**Files:** Create `home/blocks/leadership.tsx`, `leadership.test.tsx`, `home/blocks/librarian.tsx`, `librarian.test.tsx`, catalog `dashboardSchool.{id,en}.json`.

**Interfaces:** Produces `useLeadershipBlock(me, active)`, `useLibrarianBlock(me, active)`.

Data:

- `useAdminDashboardQuery(active)` + `useAdminDashboardLive` (`features/dashboard/api.ts`, `features/dashboard/realtime.ts`; read how `admin-dashboard-panel.tsx` uses them and move its queue table and `login-activity-chart.tsx` usage into this block).
- `useAtRiskStudentsQuery` (`features/analytics/api.ts`), top 5.
- Librarian: `useLibraryDashboardQuery` (`features/library/dashboard-api.ts`) + its live hook in `features/library/realtime.ts`.

Output:

- Leadership hero `HERO_PRIORITY.schoolSummary`: eyebrow "Hari ini", title "{submitted} dari {total} sesi sudah dipresensi" (from `attendance_today`), meta "{total-submitted} sesi belum diisi", action "Lihat monitor" -> `/monitor`.
- Leadership tiles: `school.sessions` 80 (`ClipboardCheck`, green, "{submitted}/{total}"), `school.pending` 75 (`Inbox`, amber, sum of pending leave+exit+late), `school.users` 50 (`Users`, blue, total active users), `school.online` 40 (`Activity`, purple).
- Leadership left `school.queue` card "Antrean sekolah" (queue table moved from `admin-dashboard-panel.tsx`); right `school.activity` card "Aktivitas login" (moved chart), `school.atRisk` card "Siswa berisiko" (name, class, reason; link to the analytics page).
- Librarian hero `HERO_PRIORITY.circulation`: eyebrow "Meja sirkulasi", title "{loans_today} pinjam · {returns_today} kembali", meta "{overdue} terlambat", action "Buka meja sirkulasi" -> the circulation route (find it under `apps/web/app/(app)/library`).
- Librarian tile `library.overdue` 65 (`BookX` or `BookOpen`, red); right slot `library.overdue` card "Terlambat terlama" (from `longest_overdue`, top 5).

Tests first: inactive -> `EMPTY_BLOCK`; hero title uses `attendance_today`; pending tile sums three queues; error -> no tiles and the queue card shows retry; librarian hero absent while loading.

Commit: `feat(web): add leadership and librarian home blocks`.

### Task 6: Picket and counselor blocks

**Files:** Create `home/blocks/picket.tsx`, `picket.test.tsx`, `home/blocks/counselor.tsx`, `counselor.test.tsx`, catalog `dashboardDuty.{id,en}.json`.

**Interfaces:** Produces `usePicketBlock(me, active)`, `useCounselorBlock(me, active)`.

Data:

- Picket: `useLateArrivalQueueQuery(active)`, `useExitPermitReviewQueueQuery(active)` (`features/permits/api.ts`).
- Counselor: `useLeaveReviewQueueQuery(active)`, `useSPCandidatesQuery` (`features/discipline/api.ts`; check its enabled parameter).

Output:

- Picket hero `HERO_PRIORITY.picketQueue` only when late queue non-empty: eyebrow "Piket hari ini", title "{n} siswa terlambat menunggu", action "Buka pemindai" -> the scan route used by `daily-task-shortcut.tsx` today.
- Picket tiles `picket.late` 88 (`AlarmClock`, amber), `picket.exit` 86 (`DoorOpen`, blue). Left slot `picket.queue` card "Piket" listing both queues (5 each).
- Counselor hero `HERO_PRIORITY.leaveQueue` when the leave queue is non-empty: eyebrow "BK", title "{n} izin menunggu tahap BK", action -> `/leave-requests`.
- Counselor tiles `counselor.leave` 84 (`FileClock`, amber), `counselor.sp` 60 (`ShieldAlert`, red, href to discipline warning letters). Left slot `counselor.queue` card "BK" (leave queue top 5 + SP candidates top 5).

Tests first: inactive -> `EMPTY_BLOCK`; empty late queue -> no picket hero but tiles show 0 once loaded; counselor hero present with 2 pending; error -> retry in card, no tiles.

Commit: `feat(web): add picket and counselor home blocks`.

---

### Task 7: Compose the new dashboard view and remove the old one

**Files:**

- Rewrite: `apps/web/features/dashboard/components/dashboard-view.tsx`
- Create: `apps/web/features/dashboard/components/dashboard-view.test.tsx`
- Delete (after moving anything still needed): `action-tiles.tsx`, `daily-task-shortcut.tsx`, `daily-task-shortcut.test.ts`, `section-card.tsx`, `today-sessions-card.tsx`, `admin-dashboard-panel.tsx`, `admin-dashboard-panel.test.tsx`, `login-activity-chart.tsx` (if moved in Task 5); remove unused keys from `app.dashboard` in `apps/web/messages/{id,en}.json` and the `dashboardPersona` catalog if nothing uses it.

**Interfaces:** Consumes all block hooks, `resolvePersonas`, `collectBlocks`, `HeroCard`, `StatTile`.

Layout (spec "Layout A"):

```tsx
<div className="mx-auto flex max-w-[1280px] flex-col gap-4 p-4 md:p-6">
  <header>  {/* "SMA Contoh · Sabtu, 26 September" small muted line, greeting h1 font-heading text-[28px] font-bold, role badges + academic year on the right (keep today's markup) */}</header>
  {hero ? <HeroCard eyebrow title meta chip action={hero.action && <Button asChild><Link href={hero.action.href}>{hero.action.label}</Link></Button>} /> : null}
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{tiles.map(t => t.href ? <Link key href className="rounded-lg focus-visible:outline-2"><StatTile .../></Link> : <StatTile key .../>)}</div>
  <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
    <div className="flex min-w-0 flex-col gap-4">{left.map(s => <Fragment key={s.key}>{s.node}</Fragment>)}</div>
    <div className="flex min-w-0 flex-col gap-4">{right...}<AnnouncementsCard /></div>
  </div>
</div>
```

- Call all seven block hooks in a fixed order (teacher, homeroom, student, leadership, picket, counselor, librarian) with `active = personas.has(key)`.
- Always add a notifications tile (`useUnreadCountQuery`, key `common.notifications`, priority 0, `Bell`, purple, href `/notifications`) so the row is never empty.
- Announcements card on the right: `Card` + `AnnouncementFeed limit={3} compact` + "Lihat semua" link (existing copy keys `announcementsTitle`, `openAnnouncements`).
- Loading (`useDashboardData` loading): skeletons sized like hero (h-36), 4 tiles (h-[104px]), two columns.
- No hero: render nothing in its place (header greeting stays).

Tests first (`dashboard-view.test.tsx`, mocking `../api`, the seven block modules and `next-intl`): hero with highest priority renders as heading; only four tiles render when blocks offer six; left slots keep block order; a parent (no personas) still sees greeting, notification tile and announcements.

Then: run the full web suite, typecheck, lint. Start the stack (`pnpm dev:docker`, see `infra/docker/README.dev.md`) and check in a browser at 1440x900 with seed accounts `guru`, `siswa`, `admin`, `kepsek`, `pustakawan`, `gurupiket`, `gurubk` (password `Password123!`): hero and tiles visible without scrolling, no console errors, no 403 in the network tab. Record results in `docs/15-paritas-sion.md` under the 26 September update.

Commit: `feat(web): compose the per-role dashboard home` and `docs: record the per-role dashboard`.
