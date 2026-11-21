"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { useCallback, useRef, type ReactElement, type ReactNode, type Ref } from "react";

import { useActiveIndicator } from "../hooks/use-active-indicator.js";
import { useControllableState } from "../hooks/use-controllable-state.js";
import { useScrollEdges } from "../hooks/use-scroll-edges.js";
import { cn } from "../utils/cn.js";

import {
  StripCount,
  stripIndicatorClass,
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
   * Stretch across the container, the segments sharing the spare width
   * (equal shares while every label fits one). "phone" does so below
   * 640px of screen only, for a strip alone on its row. A strip beside a
   * search or other filters goes in a `FilterBar` instead, without this:
   * the bar stretches it while the room it really has (not the screen)
   * stacks its controls.
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

/** A segment's own states, on top of the strip's shared item classes. */
const SEGMENT = cn(
  "group/tab data-[state=checked]:text-fg",
  // Until the sliding pill is placed (server render, no JS, a strip not
  // laid out yet) the checked segment paints its own.
  "[[data-strip]:not([data-indicator=ready])_&]:data-[state=checked]:bg-surface-raised [[data-strip]:not([data-indicator=ready])_&]:data-[state=checked]:shadow-1",
  "data-[state=unchecked]:hover:bg-state-hover data-[state=unchecked]:active:bg-state-pressed",
  "disabled:cursor-not-allowed",
  // A disabled group dims once, on the capsule, not again per segment.
  "[[role=radiogroup][data-disabled]_&]:opacity-100",
);

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/**
 * A small set of mutually exclusive modes or filters shown as one pill
 * track ("Semua / Menunggu / Disetujui"): the same track, scroller, pill,
 * item sizes and sliding indicator as the pill `Tabs` (tab-styles.tsx).
 * Radio semantics: arrow keys move and select, Tab enters at the selected
 * segment, and there is no panel to point at, which is why a filter uses
 * this and not `Tabs`.
 *
 * A segment is never narrower than its own label. A strip at its own
 * width is the sum of its labels; a stretched one (`fullWidth`, or one a
 * stacked `FilterBar` stretches) shares the spare width out, equally while
 * every label fits an equal share, and otherwise the longer labels keep
 * their own width and the shorter ones share the rest. So a strip needs
 * the sum of its labels, never the number of segments times the longest
 * one: equal columns made the inbox's four kinds need 601px where their
 * labels take 472, and hid "Keterlambatan" past the edge of a tablet's
 * 480px bar. Only a strip narrower than its labels (a phone) scrolls
 * sideways with fades, and the checked segment is scrolled into view the
 * way a tab is. The raised pill is measured from the checked segment
 * (`useActiveIndicator`) and slides there with transform only.
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
  // The radiogroup is the strip's scroller, so the segments are its own
  // flex items: they grow from their labels' width inside it, and a strip
  // too narrow for them scrolls instead of squeezing a label.
  const groupRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const setGroup = useCallback(
    (node: HTMLDivElement | null) => {
      groupRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );
  const [value, setValue] = useControllableState<T | undefined>(
    valueProp,
    defaultValue,
    onValueChange &&
      ((next) => {
        if (next !== undefined) onValueChange(next);
      }),
  );
  useScrollEdges(groupRef, { axis: "x" });
  useActiveIndicator(groupRef, indicatorRef, '[role="radio"][data-state="checked"]');

  return (
    // The capsule stays crisp while the segments scroll and fade inside it.
    <div className={cn(stripTrackClass("pill", fullWidth), disabled && "opacity-50", className)}>
      <RadioGroupPrimitive.Root
        ref={setGroup}
        id={id}
        data-strip=""
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
        className={stripScrollerClass("pill")}
      >
        <span ref={indicatorRef} aria-hidden="true" className={stripIndicatorClass("pill")} />
        {options.map((option) => (
          <RadioGroupPrimitive.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            aria-label={option.ariaLabel}
            className={cn(
              // `flex-1` grows each segment from a zero basis but never
              // below its label (no `min-w-0`): equal shares while the
              // labels fit them, the label's own width where they do not.
              stripItemClass("pill", size === "dense" ? "md" : size, true),
              size === "dense" && DENSE_ITEM,
              SEGMENT,
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
  );
}
