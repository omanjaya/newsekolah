export interface PeriodTimeLike {
  starts_at: string;
  ends_at: string;
}

export interface PeriodRangeLike {
  start_seq: number;
  end_seq: number;
}

/**
 * "HH:MM-HH:MM" from a period's (or a block's first-to-last period's)
 * "HH:MM:SS" timestamps. Shared by the grid's period column, the mobile
 * agenda/day list, and the compact current-period pill so the time format
 * reads the same everywhere on the schedule screen.
 */
export function formatPeriodTime(period: PeriodTimeLike): string {
  return `${period.starts_at.slice(0, 5)}-${period.ends_at.slice(0, 5)}`;
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
