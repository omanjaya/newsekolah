import { ChevronDown, X } from "lucide-react";
import { useRef, type ReactElement } from "react";

import { cn } from "../../utils/cn.js";

// Each half of a pill is rounded itself, rather than clipped by an
// `overflow-hidden` shell: clipping would also cut off the keyboard focus
// ring the base styles draw around whichever half has focus.
export const PILL_TRIGGER_CLASS =
  "flex h-11 items-center gap-1 rounded-full px-3 text-label whitespace-nowrap transition-colors md:pointer-fine:h-8";

/**
 * A pill that opens a list or a date popover ends in a small chevron, so it
 * reads as a filter to pick from, not as one more action button next to
 * "Tambah"; the chevron side is a little tighter. An on/off pill
 * (`type: "boolean"`) acts at once and has none.
 */
export const PILL_MENU_TRIGGER_CLASS = `${PILL_TRIGGER_CLASS} pr-2.5`;

export function PillChevron({ active }: { active: boolean }): ReactElement {
  return (
    <ChevronDown
      className={cn("size-3.5 shrink-0", active ? "opacity-70" : "text-fg-muted")}
      aria-hidden="true"
    />
  );
}

export function FilterPillShell({
  active,
  removeLabel,
  onRemove,
  trigger,
}: {
  active: boolean;
  removeLabel: string;
  onRemove: () => void;
  trigger: ReactElement;
}): ReactElement {
  const shellRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={shellRef}
      className={cn(
        "inline-flex items-center rounded-full border",
        active
          ? "border-accent bg-accent-soft text-accent-soft-fg"
          : "border-border bg-surface text-fg",
      )}
    >
      {trigger}
      {active && (
        <button
          type="button"
          aria-label={removeLabel}
          className="-ml-1 flex size-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-state-hover active:bg-state-pressed md:pointer-fine:size-8"
          onClick={() => {
            // This control leaves with the filter's value; its own pill's
            // trigger (the shell's first button) stays, so focus goes there
            // rather than dropping to <body>.
            shellRef.current?.querySelector<HTMLElement>("button")?.focus();
            onRemove();
          }}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
