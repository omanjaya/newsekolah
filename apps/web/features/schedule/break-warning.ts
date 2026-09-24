export interface BreakLikePeriod {
  sequence: number;
  is_break: boolean;
}

/**
 * True when a block's period range touches a break -- either it starts on
 * one or it runs through one on the way to its end period. The grid still
 * draws the block edge to edge across that row (see schedule-grid-cells.tsx
 * and its callers) so the timetable stays readable, but a lesson is never
 * supposed to straddle a break: this is the only signal telling the person
 * building the timetable that this block disagrees with the period
 * template and is worth a second look, typically after an import built
 * against a different template.
 */
export function blockCrossesBreak(
  block: { start_seq: number; end_seq: number },
  periods: readonly BreakLikePeriod[],
): boolean {
  return periods.some(
    (period) =>
      period.is_break && period.sequence >= block.start_seq && period.sequence <= block.end_seq,
  );
}
