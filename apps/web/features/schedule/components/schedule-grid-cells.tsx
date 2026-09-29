"use client";

import { cn } from "@newsekolah/ui";
import { AlertTriangle, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import type { ScheduleBlock } from "../api";
import { formatPeriodTime } from "../period-span";
import { SUBJECT_TONE_CLASSES, subjectTone } from "../subject-tone";

import { BlockAction } from "./block-action";
import { LessonSubstitutionAction } from "./lesson-substitution-action";

/** Thin accent edge marking "this is the period in session right now" --
 * shared by every cell kind so the line reads the same whether the current
 * slot holds a lesson, is empty, or cannot be edited. */
const CURRENT_EDGE = "shadow-[inset_2px_0_0_var(--color-accent)]";

export interface Named {
  id: string;
  name: string;
}

export interface Period {
  id: string;
  name: string;
  sequence: number;
  starts_at: string;
  ends_at: string;
  is_break: boolean;
}

/**
 * A timetable is read by scanning down a column and across a row, so the
 * cells have to line up. Both grids therefore share one geometry: every
 * lesson row is the same height, every break row is the same shorter
 * height, and content never decides either. A lesson row is tall enough
 * to hold a one-period block with its actions, so a short block and a
 * long one leave the grid looking the same; names are clipped rather than
 * allowed to push a row past its neighbours.
 */
export const LESSON_ROW = "h-20";
export const BREAK_ROW = "h-10";

/** Width of the period column, and the share each day or class column gets. */
export const PERIOD_COLUMN_PX = 112;
const MIN_SLOT_COLUMN_PX = 132;

/** Keeps the grid from squeezing columns to slivers before it scrolls. */
export function gridMinWidth(columnCount: number): number {
  return PERIOD_COLUMN_PX + columnCount * MIN_SLOT_COLUMN_PX;
}

/**
 * `h-px` lets the cell's children resolve `h-full` against the row height
 * instead of collapsing; the row's own height class is what actually sets
 * the size.
 */
const CELL = "h-px border-b border-l border-border p-0 align-top";

/**
 * The empty slots are what someone building a timetable is hunting for,
 * so they get the recessed background: a hole is a dent in the surface. A
 * lesson cell keeps the neutral surface too -- its subject-tinted card
 * (see `LessonCell`) sits inset inside it, so the color is the block, not
 * the row.
 */
const HOLLOW = "bg-bg";

export function GridColumns({ columnCount }: { columnCount: number }): ReactElement {
  return (
    <colgroup>
      <col style={{ width: PERIOD_COLUMN_PX }} />
      {Array.from({ length: columnCount }, (_, index) => (
        <col
          key={index}
          style={{ width: `calc((100% - ${PERIOD_COLUMN_PX}px) / ${columnCount})` }}
        />
      ))}
    </colgroup>
  );
}

export function HeadCell({
  children,
  first,
  current,
}: {
  children: ReactNode;
  first?: boolean;
  current?: boolean;
}): ReactElement {
  return (
    <th
      scope="col"
      aria-current={current ? "date" : undefined}
      className={cn(
        "h-10 truncate border-b-2 border-border px-3 text-left text-[13px] font-medium",
        !first && "border-l",
        // "Accent text + soft background" for today's column (docs/07-ui-ux.md,
        // "Hijau Segar"), the same AA-checked pairing Badge's accent variant uses.
        current ? "bg-accent-soft text-accent-soft-fg" : "text-fg-muted",
      )}
    >
      {children}
    </th>
  );
}

/**
 * Period name over its clock time, on one shared baseline in every row.
 * The whole column is recessed, so the time axis reads as the ruler down
 * the side rather than as a first lesson. The period in session now
 * carries an accent edge, drawn as an inset shadow so marking it does not
 * nudge the text sideways.
 */
export function PeriodCell({
  period,
  current,
}: {
  period: Period;
  current?: boolean;
}): ReactElement {
  return (
    <th
      scope="row"
      className={cn(
        "border-b border-border bg-bg px-3 text-left align-middle font-normal",
        current && "bg-accent/5 shadow-[inset_2px_0_0_var(--color-accent)]",
      )}
    >
      <span className={cn("block truncate text-[13px]", current ? "text-accent" : "text-fg")}>
        {period.name}
      </span>
      <span className="block text-[12px] text-fg-muted tabular-nums">
        {formatPeriodTime(period)}
      </span>
    </th>
  );
}

/**
 * A cell with nothing to offer: a break, or a free slot for a reader who
 * cannot fill it. It still draws its share of the grid so the columns
 * below it stay aligned.
 */
export function EmptyCell({
  today,
  current,
}: {
  today?: boolean;
  current?: boolean;
}): ReactElement {
  return <td className={cn(CELL, HOLLOW, today && "bg-accent/5", current && CURRENT_EDGE)} />;
}

/**
 * An empty slot fills its cell edge to edge: a button inset inside the
 * cell would leave a ring of dead space and break the alignment the grid
 * relies on. While a lesson is on the clipboard every free slot picks up
 * a dashed outline, because then they are drop targets and not just gaps.
 */
export function EmptySlotCell({
  pasting,
  label,
  today,
  current,
  onClick,
}: {
  pasting: boolean;
  label: string;
  today?: boolean;
  current?: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <td className={cn(CELL, HOLLOW, today && "bg-accent/5", current && CURRENT_EDGE)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex size-full items-center justify-center gap-1 text-[12px] text-fg-muted",
          "transition-colors hover:bg-accent/10 hover:text-accent",
          "focus-visible:bg-accent/10 focus-visible:text-accent",
          pasting && "border border-dashed border-accent/50 text-accent",
        )}
      >
        {pasting ? (
          <Copy className="size-3.5" aria-hidden="true" />
        ) : (
          <Plus className="size-3.5" aria-hidden="true" />
        )}
        {label}
      </button>
    </td>
  );
}

/**
 * A block whose period range touches a break (see break-warning.ts):
 * normally an imported timetable built against a different period
 * template. The grid still draws the lesson edge to edge across that row
 * so the columns stay aligned, so this badge is the only thing on screen
 * telling the person building the timetable to take a second look. The
 * icon sits on its own light backing rather than bare on the block's
 * soft-category card, so `status-late` stays legible no matter which of
 * the five tones the block landed on.
 */
function BreakWarningBadge({ label }: { label: string }): ReactElement {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface/80 p-0.5 text-status-late"
    >
      <AlertTriangle className="size-3" aria-hidden="true" />
    </span>
  );
}

/**
 * A lesson fills the periods it runs for as one rounded card, tinted with
 * its subject's soft-category tone (`subjectTone`, deterministic so the
 * same subject always paints the same color) so a full week reads as
 * subjects at a glance instead of a wall of identical white cells. The
 * card is labelled at the top so a block running three periods still
 * names itself on the row it starts on and the eye can read straight
 * across. Its three controls stay out of sight until the pointer or the
 * keyboard reaches the block: with every cell holding a lesson, showing
 * them always buried the subject names under rows of identical grey
 * icons. A touch screen has no hover to wait for, so there they stay
 * visible, on their own light backing for the same contrast reason as
 * `BreakWarningBadge`.
 */
export function LessonCell({
  block,
  span,
  subject,
  detail,
  canManage,
  today,
  current,
  crossesBreak,
  breakWarningLabel,
  onCopy,
  onEdit,
  onDelete,
  t,
}: {
  block: ScheduleBlock;
  span: number;
  subject: string;
  detail: string;
  canManage: boolean;
  today?: boolean;
  /** True when the period in session right now falls inside this block's
   * span, on the day shown; draws the current-time accent edge. */
  current?: boolean;
  /** True when this block's periods touch a break; see break-warning.ts. */
  crossesBreak?: boolean;
  breakWarningLabel?: string;
  onCopy: (block: ScheduleBlock) => void;
  onEdit: (block: ScheduleBlock) => void;
  onDelete: (block: ScheduleBlock) => void;
  t: (key: string) => string;
}): ReactElement {
  const tone = subjectTone(block.subject_id);
  return (
    <td rowSpan={span} className={cn(CELL, "p-1", today && "bg-accent/5", current && CURRENT_EDGE)}>
      <div
        className={cn(
          "group flex h-full flex-col gap-0.5 rounded-md px-2.5 py-2 transition-colors",
          SUBJECT_TONE_CLASSES[tone],
        )}
      >
        <span className="flex items-center gap-1.5 truncate text-[14px] font-medium">
          <span className="truncate">{subject}</span>
          {crossesBreak && breakWarningLabel && <BreakWarningBadge label={breakWarningLabel} />}
        </span>
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-[12px]">{detail}</span>
          <LessonSubstitutionAction block={block} compact />
        </div>
        {canManage && (
          <div
            className={cn(
              "-mx-1 mt-auto flex w-fit items-center gap-0.5 rounded-full bg-surface/70 px-0.5",
              "opacity-0 transition-opacity",
              "group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100",
            )}
          >
            <BlockAction
              label={t("copyBlock")}
              icon={<Copy className="size-3.5" aria-hidden="true" />}
              onClick={() => {
                onCopy(block);
              }}
            />
            <BlockAction
              label={t("editBlock")}
              icon={<Pencil className="size-3.5" aria-hidden="true" />}
              onClick={() => {
                onEdit(block);
              }}
            />
            <BlockAction
              label={t("deleteBlock")}
              danger
              icon={<Trash2 className="size-3.5" aria-hidden="true" />}
              onClick={() => {
                onDelete(block);
              }}
            />
          </div>
        )}
      </div>
    </td>
  );
}
