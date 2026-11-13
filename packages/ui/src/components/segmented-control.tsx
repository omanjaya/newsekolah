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
import { useScrollEdges } from "../hooks/use-scroll-edges.js";
import { cn } from "../utils/cn.js";

import { StripCount, stripItemClass, type StripSize } from "./tab-styles.js";

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
  size?: StripSize;
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

const ACTIVE_COUNT =
  "group-data-[state=checked]/tab:bg-accent-soft group-data-[state=checked]/tab:text-accent-soft-fg";

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
 * track ("Semua / Menunggu / Disetujui"), the same track, pill and item
 * sizes as the pill `Tabs`. Radio semantics: arrow keys move and select,
 * Tab enters at the selected segment, and there is no panel to point at,
 * which is why a filter uses this and not `Tabs`. Segments share one
 * width, so the raised pill slides between them by index, transform only.
 * On a phone a track wider than the screen scrolls sideways with fades.
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
  useScrollEdges(scrollerRef, { axis: "x" });

  useEffect(() => {
    revealChecked(scrollerRef.current);
  }, [index]);

  const trackStyle = {
    "--segment-count": String(Math.max(options.length, 1)),
    "--segment-index": String(Math.max(index, 0)),
  } as CSSProperties;

  return (
    // The capsule stays crisp while the segments scroll and fade inside it.
    <div
      className={cn(
        "max-w-full overflow-hidden rounded-full bg-surface-sunken",
        fullWidth ? "flex w-full" : "inline-flex w-fit",
        disabled && "opacity-50",
        className,
      )}
    >
      <div
        ref={scrollerRef}
        className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain p-1 scrollbar-none scroll-fade-x"
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
            "relative grid auto-cols-fr grid-flow-col",
            fullWidth ? "w-full min-w-max" : "w-max",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 rounded-full bg-surface-raised shadow-1 motion-indicator",
              "w-[calc(100%/var(--segment-count))] translate-x-[calc(var(--segment-index)*100%)]",
              index === -1 && "opacity-0",
            )}
          />
          {options.map((option) => (
            <RadioGroupPrimitive.Item
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className={cn(
                "group/tab",
                stripItemClass("pill", size),
                "min-w-0 data-[state=checked]:text-fg",
                "data-[state=unchecked]:hover:bg-state-hover data-[state=unchecked]:active:bg-state-pressed",
                "disabled:cursor-not-allowed",
                // A disabled group dims once, on the capsule, not again per segment.
                "[[role=radiogroup][data-disabled]_&]:opacity-100",
              )}
            >
              {option.icon !== undefined && (
                <span aria-hidden="true" className="flex shrink-0">
                  {option.icon}
                </span>
              )}
              {option.label}
              {option.count !== undefined && (
                <StripCount count={option.count} variant="pill" activeClassName={ACTIVE_COUNT} />
              )}
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
      </div>
    </div>
  );
}
