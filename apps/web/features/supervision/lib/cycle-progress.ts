/**
 * The workflow step a cycle has reached, as an index into its stepper
 * (instrument, schedule, observe, report): scheduling until a visit is
 * planned, observing while any visit is still to be filled in, and the
 * results once every planned visit has been observed.
 */
export function cycleStepIndex(scheduledCount: number, observedCount: number): number {
  if (scheduledCount === 0) return 1;
  return observedCount >= scheduledCount ? 3 : 2;
}
