import type { FeatureModule } from "../../../lib/modules/feature-modules";
import { decodeScanPayload } from "../../permits/api";

/** What the universal scanner does with a code, one per backend scan-token purpose. */
export type ScanAction =
  "classroom_entry" | "late_arrival" | "exit_stage" | "gate_exit" | "library_visit";

/**
 * The feature module whose endpoint each action calls. An action whose
 * module the school has switched off is not offered: its QR is answered
 * with "unavailable" instead of a request the API would refuse. Keep in
 * step with `SCAN_SECTIONS` (lib/navigation-sections.ts), which opens the
 * page while any of these modules is on.
 */
export const SCAN_ACTION_MODULE: Record<ScanAction, FeatureModule> = {
  classroom_entry: "permits",
  late_arrival: "permits",
  exit_stage: "permits",
  gate_exit: "permits",
  library_visit: "library",
};

export type ScanUnknownReason =
  "empty" | "bare" | "unsupported" | "missing_instance" | "unavailable";

export type ScanRoute =
  | { action: ScanAction; token: string; instanceId?: string }
  | { action: "unknown"; reason: ScanUnknownReason };

/**
 * QR payload kind -> action. Kinds are the ones the minting screens
 * encode ("sion:<kind>:<instanceId>:<token>", features/permits/api.ts):
 * the duty desk emits the scan-token purpose itself, the exit-permit
 * screens emit "approve"/"gate", and the library kiosk emits
 * "library_visit". The scan-token purpose names are accepted as aliases,
 * as the mobile scanner does.
 */
const KIND_ACTION: Record<string, { action: ScanAction; needsInstance: boolean }> = {
  classroom_entry: { action: "classroom_entry", needsInstance: false },
  late_arrival: { action: "late_arrival", needsInstance: false },
  approve: { action: "exit_stage", needsInstance: true },
  approve_stage: { action: "exit_stage", needsInstance: true },
  gate: { action: "gate_exit", needsInstance: true },
  gate_exit: { action: "gate_exit", needsInstance: true },
  library_visit: { action: "library_visit", needsInstance: false },
};

/**
 * Decides, from the payload alone, which existing action a scanned code
 * belongs to. A bare token (typed by hand, no "sion:" prefix) carries no
 * purpose, so it is reported as unknown rather than guessed: guessing
 * would consume a single-use token against the wrong endpoint. A code
 * for an action whose module is in `disabledModules` is "unavailable".
 */
export function resolveScanRoute(raw: string, disabledModules: readonly string[] = []): ScanRoute {
  if (raw.trim() === "") return { action: "unknown", reason: "empty" };
  const { kind, instanceId, token } = decodeScanPayload(raw);
  if (!kind) return { action: "unknown", reason: "bare" };
  const entry = KIND_ACTION[kind];
  if (!entry) return { action: "unknown", reason: "unsupported" };
  if (disabledModules.includes(SCAN_ACTION_MODULE[entry.action])) {
    return { action: "unknown", reason: "unavailable" };
  }
  if (entry.needsInstance && !instanceId) return { action: "unknown", reason: "missing_instance" };
  return { action: entry.action, token, ...(instanceId ? { instanceId } : {}) };
}

/** Which group of actions the scanner offers, for its intro text. */
export type ScanOffer = "all" | "permits" | "library";

export function scanOffer(disabledModules: readonly string[]): ScanOffer {
  const permits = !disabledModules.includes("permits");
  const library = !disabledModules.includes("library");
  if (permits && library) return "all";
  return permits ? "permits" : "library";
}

export type ScanFailureKind = "expired" | "error";

/** The API answers an expired or already-used scan token with 410 (`TokenGone`). */
export function classifyScanFailure(status: number | undefined): ScanFailureKind {
  return status === 410 ? "expired" : "error";
}
