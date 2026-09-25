/** Reconnect attempts stop growing the delay past this ceiling; they never stop entirely (see LiveSocketProvider's doc comment: "no silent give-up"). */
export const BASE_DELAY_MS = 1_000;
export const MAX_DELAY_MS = 30_000;

/**
 * Exponential backoff with full jitter, so many tabs (or many schools on
 * the same rolling deploy) do not reconnect in lockstep. Uncapped in
 * `attempt` by design: once `attempt` pushes the ceiling to MAX_DELAY_MS,
 * further attempts keep retrying at that same capped ceiling instead of
 * this function ever being asked to stop -- LiveSocketProvider never
 * checks a maximum-attempts count, only this ceiling
 * (docs/analysis/realtime-plan-2026-09-25.md section 1.5 #4: the previous
 * `useNotificationsSocket` gave up silently after 6 failures).
 */
export function reconnectDelay(attempt: number): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
}
