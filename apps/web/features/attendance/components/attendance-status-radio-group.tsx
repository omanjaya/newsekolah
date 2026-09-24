"use client";

import { cn, type StatusName } from "@newsekolah/ui";
import type { CSSProperties, KeyboardEvent, ReactElement } from "react";
import { useRef } from "react";

import type { SessionDetail } from "../api";
import { resolveStatusKey } from "../lib/status-keyboard";
import { statusToken } from "../lib/status-tokens";

type AttendanceStatus = SessionDetail["statuses"][number];

// Static class names (Tailwind needs the literal string in source to keep
// it in the build) for the five default status tokens the segmented
// control colours itself with. A status code outside this set -- a
// tenant that reconfigured its status policy -- falls back to its own
// `color` hex from the API via inline style in {@link colorStyle} instead.
const SELECTED_CLASS: Record<StatusName, string> = {
  present: "border-status-present bg-status-present text-bg",
  sick: "border-status-sick bg-status-sick text-bg",
  excused: "border-status-excused bg-status-excused text-bg",
  dispensation: "border-status-dispensation bg-status-dispensation text-bg",
  absent: "border-status-absent bg-status-absent text-bg",
  late: "border-status-late bg-status-late text-bg",
};

const UNSELECTED_CLASS: Record<StatusName, string> = {
  present: "border-status-present/40 text-status-present-fg hover:bg-status-present/10",
  sick: "border-status-sick/40 text-status-sick-fg hover:bg-status-sick/10",
  excused: "border-status-excused/40 text-status-excused-fg hover:bg-status-excused/10",
  dispensation:
    "border-status-dispensation/40 text-status-dispensation-fg hover:bg-status-dispensation/10",
  absent: "border-status-absent/40 text-status-absent-fg hover:bg-status-absent/10",
  late: "border-status-late/40 text-status-late-fg hover:bg-status-late/10",
};

/** Inline fallback for a status code with no design token (a custom tenant policy). */
function colorStyle(color: string, selected: boolean): CSSProperties {
  return selected
    ? { backgroundColor: color, borderColor: color, color: "var(--color-bg)" }
    : { borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, color };
}

export function AttendanceStatusRadioGroup({
  statuses,
  value,
  label,
  disabled,
  onChange,
}: {
  statuses: AttendanceStatus[];
  value: string;
  label: string;
  disabled: boolean;
  onChange: (code: string) => void;
}): ReactElement {
  const controls = useRef(new Map<string, HTMLButtonElement>());

  function selectAt(index: number) {
    const next = statuses[index];
    if (!next) return;
    onChange(next.code);
    controls.current.get(next.code)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const action = resolveStatusKey(event.key, index, statuses.length);
    if (action.type === "select") {
      event.preventDefault();
      selectAt(action.index);
    }
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {statuses.map((status, index) => {
        const selected = value === status.code;
        const token = statusToken(status.code);
        return (
          <button
            key={status.code}
            ref={(element) => {
              if (element) controls.current.set(status.code, element);
              else controls.current.delete(status.code);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={status.label}
            title={status.label}
            tabIndex={
              selected || (index === 0 && !statuses.some((item) => item.code === value)) ? 0 : -1
            }
            disabled={disabled}
            onClick={() => {
              onChange(status.code);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
            style={token ? undefined : colorStyle(status.color, selected)}
            className={cn(
              "min-h-11 min-w-11 rounded-xs border px-2.5 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              token && (selected ? SELECTED_CLASS[token] : UNSELECTED_CLASS[token]),
            )}
          >
            <span className="sm:hidden">{status.code}</span>
            <span className="hidden sm:inline">{status.label}</span>
          </button>
        );
      })}
    </div>
  );
}
