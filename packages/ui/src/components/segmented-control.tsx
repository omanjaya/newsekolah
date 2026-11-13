"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

import { useControllableState } from "../hooks/use-controllable-state.js";
import { cn } from "../utils/cn.js";

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: string;
  /** A Lucide icon element, sized for you. */
  icon?: ReactNode;
  /** A count after the label, e.g. pending items in a filter. */
  count?: number;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedControlOption<T>[];
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  /** "md" (default) for a mode switch, "sm" for a compact filter in a toolbar. */
  size?: "sm" | "md";
  /** Stretch across the container, segments sharing the width equally. */
  fullWidth?: boolean;
  disabled?: boolean;
  /** Posts the value with a native form. */
  name?: string;
  /** On the radiogroup, as `FormControl` sets it along with `aria-describedby`. */
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  /** The radiogroup element. */
  ref?: Ref<HTMLDivElement>;
  className?: string;
}

const ITEM_SIZE = {
  sm: "h-11 px-3 md:h-7",
  md: "h-11 px-4 md:h-9",
} as const;

/** Keeps the checked segment inside a scrolled-away overflow, without moving the page. */
function revealChecked(scroller: HTMLElement | null) {
  const item = scroller?.querySelector<HTMLElement>("[data-state=checked]");
  if (!scroller || !item) return;
  const left = item.offsetLeft;
  const right = left + item.offsetWidth;
  if (left < scroller.scrollLeft) scroller.scrollLeft = left - 4;
  else if (right > scroller.scrollLeft + scroller.clientWidth) {
    scroller.scrollLeft = right - scroller.clientWidth + 4;
  }
}

/**
 * A small set of mutually exclusive modes or filters shown as one pill
 * track ("Semua / Menunggu / Disetujui"). Radio semantics: arrow keys move
 * and select, Tab enters at the selected segment. Segments share one width,
 * so the white indicator slides between them with a transform only. On a
 * phone a track wider than the screen scrolls sideways.
 */
export function SegmentedControl<T extends string = string>({
  options,
  value: valueProp,
  defaultValue,
  onValueChange,
  size = "md",
  fullWidth,
  disabled,
  name,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  ref,
  className,
}: SegmentedControlProps<T>): ReactElement {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useControllableState<T | undefined>(
    valueProp,
    defaultValue,
    onValueChange &&
      ((next) => {
        if (next !== undefined) onValueChange(next);
      }),
  );
  const index = options.findIndex((option) => option.value === value);

  useEffect(() => {
    revealChecked(scrollerRef.current);
  }, [index]);

  const trackStyle = {
    "--segment-count": String(Math.max(options.length, 1)),
    "--segment-index": String(Math.max(index, 0)),
  } as CSSProperties;

  return (
    <div
      ref={scrollerRef}
      className={cn(
        "max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        fullWidth ? "w-full" : "w-fit",
        className,
      )}
    >
      <RadioGroupPrimitive.Root
        ref={ref}
        id={id}
        aria-describedby={ariaDescribedBy}
        value={value ?? ""}
        onValueChange={(next) => {
          const option = options.find((candidate) => candidate.value === next);
          if (option) setValue(option.value);
        }}
        orientation="horizontal"
        disabled={disabled}
        name={name}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        style={trackStyle}
        className={cn(
          "relative grid auto-cols-fr grid-flow-col rounded-full border border-border bg-bg p-1",
          fullWidth ? "w-full min-w-max" : "w-max",
          disabled && "opacity-50",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-1 left-1 rounded-full bg-surface shadow-(--shadow-card)",
            "w-[calc((100%_-_0.5rem)/var(--segment-count))] translate-x-[calc(var(--segment-index)*100%)]",
            "transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)] motion-reduce:transition-none",
            index === -1 && "opacity-0",
          )}
        />
        {options.map((option) => (
          <RadioGroupPrimitive.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className={cn(
              "relative flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full",
              "text-sm font-medium text-fg-muted",
              "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
              "hover:text-fg data-[state=checked]:text-fg",
              // The ring hugs the pill instead of spilling over the track's edge.
              "focus-visible:outline-offset-0",
              "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-fg-muted",
              ITEM_SIZE[size],
            )}
          >
            {option.icon !== undefined && (
              <span aria-hidden="true" className="flex shrink-0 [&>svg]:size-4">
                {option.icon}
              </span>
            )}
            {option.label}
            {/* The space keeps "Menunggu 3" apart in the accessible name; flex
                layout ignores it, the gap does the visual spacing. */}
            {option.count !== undefined && " "}
            {option.count !== undefined && (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums",
                  "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
                  option.value === value
                    ? "bg-accent-soft text-accent-soft-fg"
                    : "bg-surface text-fg-muted",
                )}
              >
                {option.count}
              </span>
            )}
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
    </div>
  );
}
