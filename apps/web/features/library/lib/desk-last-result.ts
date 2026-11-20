import type { DeskBasketItem } from "./desk-basket";

/**
 * What the circulation desk's result banner says about the last scan,
 * derived from the desk session's own state rather than a second history:
 * a scan error wins, then the most recent basket row of the active mode
 * (the basket keeps the newest scan first), then the member just picked.
 * `null` is the idle desk, before anything was scanned.
 */
export type DeskLastResult =
  | { kind: "error"; message: string }
  | { kind: "item"; item: DeskBasketItem }
  | { kind: "member"; name: string; attention: boolean }
  | null;

export function deskLastResult({
  scanError,
  memberName,
  memberNeedsAttention,
  items,
}: {
  scanError: string;
  memberName: string | null;
  memberNeedsAttention: boolean;
  items: readonly DeskBasketItem[];
}): DeskLastResult {
  if (scanError) return { kind: "error", message: scanError };
  // A return or renewal needs no member, so its row shows even before
  // anyone is being served.
  const latest = items[0];
  if (latest) return { kind: "item", item: latest };
  if (memberName === null) return null;
  return { kind: "member", name: memberName, attention: memberNeedsAttention };
}

/** The banner tone for a basket row: added or settled reads as success, a refused copy as a warning, a failed call as danger. */
export function deskItemTone(state: DeskBasketItem["state"]): "success" | "warning" | "danger" {
  if (state === "blocked") return "warning";
  if (state === "failed") return "danger";
  return "success";
}
