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
  present: "bg-status-present text-bg",
  sick: "bg-status-sick text-bg",
  excused: "bg-status-excused text-bg",
  dispensation: "bg-status-dispensation text-bg",
  absent: "bg-status-absent text-bg",
  late: "bg-status-late text-bg",
};

const UNSELECTED_CLASS: Record<StatusName, string> = {
  present: "text-status-present-fg hover:bg-status-present/10",
  sick: "text-status-sick-fg hover:bg-status-sick/10",
  excused: "text-status-excused-fg hover:bg-status-excused/10",
  dispensation: "text-status-dispensation-fg hover:bg-status-dispensation/10",
  absent: "text-status-absent-fg hover:bg-status-absent/10",
  late: "text-status-late-fg hover:bg-status-late/10",
};

/** Inline fallback for a status code with no design token (a custom tenant policy). */
function colorStyle(color: string, selected: boolean): CSSProperties {
  return selected ? { backgroundColor: color, color: "var(--color-bg)" } : { color };
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
    // One joined control (the shared radius on the outside, cells meeting
    // in the middle) so a row reads as one choice, not five loose buttons.
    <div
      role="radiogroup"
      aria-label={label}
      className="flex w-full divide-x divide-line overflow-hidden rounded-md border border-border-strong bg-surface sm:w-auto"
    >
      {statuses.map((status, index) => {
        const selected = value === status.code;
        const token = statusToken(status.code);
        return (
          // One segment of a roving radio group in attendance colours (a
          // tenant's own status in its API colour): no shared control draws
          // per-option status colours yet.
          // eslint-disable-next-line design-system/no-raw-elements -- status segment, see above
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
              "min-h-11 min-w-11 flex-1 px-2.5 text-label transition-colors md:pointer-fine:min-h-9 sm:flex-none",
              "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
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
