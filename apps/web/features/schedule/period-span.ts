import { clockRange } from "./clock-label";

export interface PeriodTimeLike {
  starts_at: string;
  ends_at: string;
}

export interface PeriodRangeLike {
  start_seq: number;
  end_seq: number;
}

/**
 * A period's (or a block's first-to-last period's) span as people read it,
 * "07.00 – 07.45" in Indonesian, through `clockRange`: the grid's period
 * column and the compact current-period pill write times the same way as
 * the agenda, the attendance screens and the rest of the app.
 */
export function formatPeriodTime(period: PeriodTimeLike, locale: string): string {
  return clockRange(period.starts_at, period.ends_at, locale);
}

/**
 * How many lesson-period rows a block's `rowSpan` should cover. A block
 * always has `end_seq >= start_seq` by construction (the server rejects
 * the reverse), but this clamps to 1 rather than trusting that blindly --
 * a `rowSpan={0}` would drop the cell from the table entirely and shift
 * every column after it in that row, which is exactly the kind of grid
 * misalignment these tables have to stay defensive against.
 */
export function periodSpan(block: PeriodRangeLike): number {
  return Math.max(1, block.end_seq - block.start_seq + 1);
}
