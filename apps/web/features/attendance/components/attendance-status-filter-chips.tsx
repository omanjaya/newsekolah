"use client";

import { cn, type StatusName } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { SessionDetail } from "../api";
import { statusToken } from "../lib/status-tokens";

type AttendanceStatus = SessionDetail["statuses"][number];

// Full class names so Tailwind's scanner generates them (module-level static
// maps, same approach as `attendance-status-radio-group.tsx`).
const DOT_CLASS: Record<StatusName, string> = {
  present: "bg-status-present",
  sick: "bg-status-sick",
  excused: "bg-status-excused",
  dispensation: "bg-status-dispensation",
  absent: "bg-status-absent",
  late: "bg-status-late",
};

const SELECTED_CLASS: Record<StatusName, string> = {
  present: "border-status-present bg-status-present/10 text-status-present-fg",
  sick: "border-status-sick bg-status-sick/10 text-status-sick-fg",
  excused: "border-status-excused bg-status-excused/10 text-status-excused-fg",
  dispensation: "border-status-dispensation bg-status-dispensation/10 text-status-dispensation-fg",
  absent: "border-status-absent bg-status-absent/10 text-status-absent-fg",
  late: "border-status-late bg-status-late/10 text-status-late-fg",
};

/**
 * The roster's per-status counts as one low row of equal pills: a status
 * dot, the count and the status (its code on a phone, where five full
 * labels do not fit). They double as the roster's filter: tapping one
 * shows only the students with that status, tapping it again clears it.
 * Sticks under the app header while the roster scrolls, so the count
 * stays in view.
 */
export function AttendanceStatusFilterChips({
  statuses,
  counts,
  active,
  onToggle,
}: {
  statuses: AttendanceStatus[];
  counts: Record<string, number>;
  active: Set<string>;
  onToggle: (code: string) => void;
}): ReactElement {
  const t = useTranslations("app.attendance.session");
  return (
    <div
      role="group"
      aria-label={t("filterByStatus")}
      className="grid auto-cols-fr grid-flow-col gap-1.5"
    >
      {statuses.map((status) => {
        const selected = active.has(status.code);
        const token = statusToken(status.code);
        const count = counts[status.code] ?? 0;
        return (
          <button
            key={status.code}
            type="button"
            aria-pressed={selected}
            aria-label={`${status.label} ${String(count)}`}
            title={status.label}
            onClick={() => {
              onToggle(status.code);
            }}
            // A tenant's own status (no design token) draws in its API colour.
            style={
              token
                ? undefined
                : selected
                  ? {
                      backgroundColor: `color-mix(in srgb, ${status.color} 10%, transparent)`,
                      borderColor: status.color,
                    }
                  : undefined
            }
            className={cn(
              "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-label motion-press transition-colors",
              "md:pointer-fine:min-h-9",
              selected && token
                ? SELECTED_CLASS[token]
                : "border-border bg-surface text-fg hover:bg-state-hover",
            )}
          >
            <span
              aria-hidden="true"
              className={cn("size-2 shrink-0 rounded-full", token && DOT_CLASS[token])}
              style={token ? undefined : { backgroundColor: status.color }}
            />
            <span className="text-heading tabular-nums">{count}</span>
            <span className="truncate text-caption font-medium text-fg-muted sm:hidden">
              {status.code}
            </span>
            <span className="hidden truncate text-caption font-medium text-fg-muted sm:inline">
              {status.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
