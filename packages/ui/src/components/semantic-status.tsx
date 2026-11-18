import type { ComponentPropsWithRef, ReactElement } from "react";

import { Badge, type BadgeSize } from "./badge.js";
import type { StatusName } from "./status-badge.js";
import type { SemanticTone } from "./tone.js";

/**
 * The workflow vocabulary every module shares (permits, discipline,
 * library, billing, visitors, grading): one meaning, one word, one tone.
 * Screens pick the semantic state; the colour comes from here, never from a
 * per-screen `accent` / `neutral` guess.
 */
export type SemanticStatus =
  | "pending" // Menunggu
  | "in_progress" // Berjalan
  | "approved" // Disetujui
  | "rejected" // Ditolak
  | "cancelled" // Dibatalkan
  | "completed" // Selesai
  | "expired" // Kedaluwarsa
  | "overdue" // Terlambat
  | "draft" // Draf
  | "published" // Terbit
  | "paid" // Lunas
  | "partial" // Dibayar sebagian
  | "unpaid" // Belum dibayar
  | "waived" // Dibebaskan
  | "open" // Terbuka
  | "closed" // Ditutup
  | "active" // Aktif
  | "inactive"; // Nonaktif

/**
 * Semantic state to a feedback tone (docs/07-ui-ux.md section 0: semantic
 * colours for general states, `status-*` for attendance only). `neutral`
 * is a quiet end state with no alarm colour.
 *
 * - warning: waiting on someone, or only partly done
 * - info: under way
 * - success: finished well
 * - danger: refused or past due
 */
export const SEMANTIC_STATUS_TONE: Record<SemanticStatus, SemanticTone | "neutral"> = {
  pending: "warning",
  open: "warning",
  partial: "warning",
  in_progress: "info",
  approved: "success",
  completed: "success",
  published: "success",
  paid: "success",
  active: "success",
  rejected: "danger",
  overdue: "danger",
  cancelled: "neutral",
  expired: "neutral",
  draft: "neutral",
  unpaid: "neutral",
  waived: "neutral",
  closed: "neutral",
  inactive: "neutral",
};

export function semanticStatusTone(status: SemanticStatus): SemanticTone | "neutral" {
  return SEMANTIC_STATUS_TONE[status];
}

/**
 * Legacy: the attendance-token form of `SEMANTIC_STATUS_TONE`, from when
 * workflow states borrowed the `status-*` colours. Kept for code that still
 * colours a status that way; new code uses `SEMANTIC_STATUS_TONE` or
 * renders `SemanticStatusBadge`.
 */
export const SEMANTIC_STATUS_TOKEN: Record<SemanticStatus, StatusName | null> = {
  pending: "sick",
  open: "sick",
  in_progress: "excused",
  approved: "present",
  completed: "present",
  published: "present",
  paid: "present",
  active: "present",
  partial: "late",
  rejected: "absent",
  overdue: "absent",
  cancelled: null,
  expired: null,
  draft: null,
  unpaid: null,
  waived: null,
  closed: null,
  inactive: null,
};

/** Legacy, see `SEMANTIC_STATUS_TOKEN`; new code uses `semanticStatusTone`. */
export function semanticStatusToken(status: SemanticStatus): StatusName | null {
  return SEMANTIC_STATUS_TOKEN[status];
}

export interface SemanticStatusBadgeProps extends Omit<ComponentPropsWithRef<"span">, "children"> {
  status: SemanticStatus;
  /** The localized word for this state; always shown next to the colour. */
  label: string;
  size?: BadgeSize;
}

/** A status pill whose tone is fixed by its meaning (`SEMANTIC_STATUS_TONE`), with a leading dot. */
export function SemanticStatusBadge({
  status,
  label,
  size,
  ...props
}: SemanticStatusBadgeProps): ReactElement {
  return (
    <Badge tone={SEMANTIC_STATUS_TONE[status]} size={size} dot data-status={status} {...props}>
      {label}
    </Badge>
  );
}
