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

import { revealInStrip } from "../hooks/use-active-indicator.js";
import { useControllableState } from "../hooks/use-controllable-state.js";
import { useScrollEdges } from "../hooks/use-scroll-edges.js";
import { cn } from "../utils/cn.js";

import {
  StripCount,
  stripItemClass,
  stripScrollerClass,
  stripTrackClass,
  type StripSize,
} from "./tab-styles.js";

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: string;
  /** A Lucide icon element, sized for you. */
  icon?: ReactNode;
  /** A count after the label, e.g. pending items in a filter. */
  count?: number;
  /**
   * The segment's accessible name when the visible label and count alone
   * would be read as a bare "TG1 2", e.g. "TG1, 2 kosong". A phone screen
   * reader names each radio as the user swipes to it and skips the group's
   * description, so a count that needs words carries them here.
   */
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * "md" (default) for a mode switch, "sm" for a compact filter in a
 * toolbar, "dense" for many short segments that must share a phone's
 * width (the seven days of a week: "Sen" to "Min" at 390px). Dense keeps
 * the md height and the 44px touch area, and trims the side padding.
 */
export type SegmentedControlSize = StripSize | "dense";

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedControlOption<T>[];
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  /** See `SegmentedControlSize`. */
  size?: SegmentedControlSize;
  /**
   * Stretch across the container, segments sharing the width equally.
   * "phone" does so below 640px of screen only, for a strip alone on its
   * row. A strip beside a search or other filters goes in a `FilterBar`
   * instead, without this: the bar stretches it while the room it really
   * has (not the screen) stacks its controls.
   */
  fullWidth?: boolean | "phone";
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

// 6px a side and a 4px gap: a three-letter day name with a "today" dot
// stays under 50px, so seven of them fit the 358px of a 390px phone.
const DENSE_ITEM = "gap-1 px-1.5 pointer-coarse:px-1.5";

/**
 * A small set of mutually exclusive modes or filters shown as one pill
 * track ("Semua / Menunggu / Disetujui"): the same track, scroller, pill
 * and item sizes as the pill `Tabs` (tab-styles.tsx). Radio semantics:
 * arrow keys move and select, Tab enters at the selected segment, and
 * there is no panel to point at, which is why a filter uses this and not
 * `Tabs`. Its indicator is the one deliberate difference: segments share
 * one width (an equal-column grid), so the raised pill slides between them
 * by index in pure CSS, transform only, with no measuring. On a phone a
 * track wider than the screen scrolls sideways with fades, and the checked
 * segment is scrolled into view the way a tab is.
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
    const scroller = scrollerRef.current;
    const checked = scroller?.querySelector<HTMLElement>("[data-state=checked]");
    if (scroller && checked) revealInStrip(scroller, checked);
  }, [index]);

  const trackStyle = {
    "--segment-count": String(Math.max(options.length, 1)),
    "--segment-index": String(Math.max(index, 0)),
  } as CSSProperties;

  return (
    // The capsule stays crisp while the segments scroll and fade inside it.
    <div className={cn(stripTrackClass("pill", fullWidth), disabled && "opacity-50", className)}>
      <div ref={scrollerRef} className={stripScrollerClass("pill")}>
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
          // Never squeezed by the scroller's flex row: a track too wide for
          // the screen scrolls instead. It fills whatever width the track
          // is given (its own, `fullWidth`, or a stacked FilterBar's), so
          // the segments share a stretched track.
          className="relative grid w-full min-w-max shrink-0 auto-cols-fr grid-flow-col"
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
              aria-label={option.ariaLabel}
              className={cn(
                "group/tab",
                stripItemClass("pill", size === "dense" ? "md" : size),
                size === "dense" && DENSE_ITEM,
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
