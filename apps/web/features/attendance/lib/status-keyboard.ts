/** What a key press does to a focused status control, decoupled from the DOM for unit testing. */
export type StatusKeyAction = { type: "select"; index: number } | { type: "none" };

/**
 * Resolves one keydown on the attendance status segmented control:
 * arrow/Home/End move roving focus (docs/07-ui-ux.md "semua tabel dan form
 * dapat dioperasikan tanpa mouse"), and a digit 1-9 jumps straight to that
 * status by its position in the tenant's policy order, so a teacher on a
 * laptop keyboard can set a status in one keystroke instead of arrowing
 * to it.
 */
export function resolveStatusKey(
  key: string,
  currentIndex: number,
  length: number,
): StatusKeyAction {
  if (length <= 0) return { type: "none" };
  if (key === "ArrowRight" || key === "ArrowDown") {
    return { type: "select", index: (currentIndex + 1) % length };
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return { type: "select", index: (currentIndex - 1 + length) % length };
  }
  if (key === "Home") return { type: "select", index: 0 };
  if (key === "End") return { type: "select", index: length - 1 };
  if (/^[1-9]$/.test(key)) {
    const digitIndex = Number(key) - 1;
    if (digitIndex < length) return { type: "select", index: digitIndex };
  }
  return { type: "none" };
}
