"use client";

import { cn } from "@newsekolah/ui";
import type { KeyboardEvent, ReactElement } from "react";
import { useRef } from "react";

import type { SessionDetail } from "../api";

type AttendanceStatus = SessionDetail["statuses"][number];

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
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectAt((index + 1) % statuses.length);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectAt((index - 1 + statuses.length) % statuses.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectAt(statuses.length - 1);
    }
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xs border border-border">
      {statuses.map((status, index) => {
        const selected = value === status.code;
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
            className={cn(
              "min-h-11 min-w-11 px-2 py-2 text-[13px] font-medium first:rounded-l-xs last:rounded-r-xs disabled:opacity-50",
              selected ? "bg-accent text-accent-fg" : "text-fg hover:bg-bg",
            )}
          >
            {status.code}
          </button>
        );
      })}
    </div>
  );
}
