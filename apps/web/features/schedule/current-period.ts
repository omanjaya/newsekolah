/**
 * True when this week-grid cell is the one lesson period happening right
 * now: its day column is today and its row is the period currently in
 * session. Drives the thin current-time accent drawn on the intersecting
 * cell, so "where am I now" is answered by the grid itself instead of a
 * separate banner. `currentSequence` is `undefined` outside school hours
 * (no period in session), which always reads as "not now".
 */
export function isCurrentPeriodCell(
  day: number,
  today: number,
  periodSequence: number,
  currentSequence: number | undefined,
): boolean {
  return day === today && currentSequence !== undefined && periodSequence === currentSequence;
}

/**
 * Same accent rule for a single-day view (the day grid, the mobile day
 * list) where every column already belongs to the one day being looked
 * at, so there is no separate day column to match: the row is "now"
 * exactly when that day is today and its sequence is the period in
 * session.
 */
export function isCurrentPeriodRow(
  isViewingToday: boolean,
  periodSequence: number,
  currentSequence: number | undefined,
): boolean {
  return isViewingToday && currentSequence !== undefined && periodSequence === currentSequence;
}

/**
 * True when the period in session right now falls anywhere inside a
 * block's span, not only on its first period -- a three-period block is
 * still "now" on its second and third rows. Used to mark a lesson card
 * "sedang berlangsung" in the mobile agenda and, with the same block
 * style now shared across views, everywhere else a block renders as one
 * card rather than one row per period.
 */
export function isNowWithinBlock(
  startSeq: number,
  endSeq: number,
  currentSequence: number | undefined,
): boolean {
  return currentSequence !== undefined && currentSequence >= startSeq && currentSequence <= endSeq;
}
