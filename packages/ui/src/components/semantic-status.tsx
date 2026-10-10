import type { ComponentPropsWithoutRef, ReactElement } from "react";

import { Badge } from "./badge.js";
import { StatusBadge, type StatusName } from "./status-badge.js";

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
 * Semantic state to a `StatusBadge` colour token (the attendance tokens are
 * the app-wide "state at a glance" palette, docs/07-ui-ux.md). `null` means
 * a quiet state with no alarm colour: it renders as a neutral `Badge`.
 *
 * - amber (sick): waiting on someone
 * - blue (excused): under way
 * - green (present): finished well
 * - orange (late): partly done
 * - red (absent): refused or past due
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

export function semanticStatusToken(status: SemanticStatus): StatusName | null {
  return SEMANTIC_STATUS_TOKEN[status];
}

export interface SemanticStatusBadgeProps extends Omit<
  ComponentPropsWithoutRef<"span">,
  "children"
> {
  status: SemanticStatus;
  /** The localized word for this state; always shown next to the colour. */
  label: string;
}

/** A status label whose colour is fixed by its meaning (`SEMANTIC_STATUS_TOKEN`). */
export function SemanticStatusBadge({
  status,
  label,
  ...props
}: SemanticStatusBadgeProps): ReactElement {
  const token = SEMANTIC_STATUS_TOKEN[status];
  if (!token) {
    return (
      <Badge variant="neutral" {...props}>
        {label}
      </Badge>
    );
  }
  return <StatusBadge status={token} label={label} {...props} />;
}
