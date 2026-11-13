"use client";

import { Check, ChevronDown, Clock } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";

import { useControllableState } from "../hooks/use-controllable-state.js";
import { cn } from "../utils/cn.js";
import {
  clampMinutes,
  formatTime,
  parseTime,
  parseTypedTime,
  timeSteps,
  toTime,
} from "../utils/time-of-day.js";

import {
  FIELD_BOX,
  FIELD_BOX_DISABLED,
  FIELD_BOX_INVALID,
  FIELD_BOX_WITH_INPUT,
  FIELD_ICON_BUTTON,
  FIELD_INNER_INPUT,
} from "./field-box.js";
import { isInvalid } from "./picker-field.js";
import { Popover, PopoverAnchor, PopoverContent } from "./popover.js";
import { useUiLabels } from "./ui-labels.js";

export interface TimePickerProps {
  /** 24-hour "HH:mm", or ""/null for none. An API's "HH:mm:ss" is read too; the seconds are dropped. */
  value?: string | null;
  defaultValue?: string;
  /** Called with "HH:mm", or "" when the field is emptied. */
  onChange?: (value: string) => void;
  /** Spacing of the suggested times; any minute can still be typed. Default 15. */
  minuteStep?: number;
  /** Earliest time, "HH:mm" (or "HH:mm:ss"): the list starts here and typed times are clamped to it. */
  min?: string;
  /** Latest time, "HH:mm". */
  max?: string;
  /** Formats the shown time ("08.30" for id-ID); defaults to `UiLabels.locale`. */
  locale?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Renders a hidden input with the "HH:mm" value for a native form post. */
  name?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: InputHTMLAttributes<HTMLInputElement>["aria-invalid"];
  onBlur?: () => void;
  className?: string;
}

/** Index of the first suggestion at or after `minutes`, else the last one. */
function nearestIndex(options: number[], minutes: number | null): number {
  if (minutes === null || options.length === 0) return -1;
  const index = options.findIndex((option) => option >= minutes);
  return index === -1 ? options.length - 1 : index;
}

function optionIndexOf(target: EventTarget): number | null {
  if (!(target instanceof Element)) return null;
  const index = target.closest<HTMLElement>("[data-index]")?.dataset.index;
  return index === undefined ? null : Number(index);
}

function keepOptionVisible(list: HTMLElement | null, index: number, center: boolean) {
  const option = list?.querySelector<HTMLElement>(`[data-index="${index}"]`);
  if (!list || !option) return;
  if (center) {
    list.scrollTop = option.offsetTop - list.clientHeight / 2 + option.offsetHeight / 2;
  } else if (option.offsetTop < list.scrollTop) {
    list.scrollTop = option.offsetTop;
  } else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
    list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  }
}

/**
 * A time field: type it ("0830", "8.30", "14") or pick from a list of
 * steps. The value is 24-hour "HH:mm" whatever the locale shows. An
 * editable combobox: focus stays in the input while the arrow keys move
 * through the list. The ref is the input.
 */
export const TimePicker = forwardRef<HTMLInputElement, TimePickerProps>(function TimePicker(
  {
    value: valueProp,
    defaultValue = "",
    onChange,
    minuteStep = 15,
    min,
    max,
    locale: localeProp,
    placeholder,
    required,
    disabled,
    invalid,
    name,
    onBlur,
    className,
    "aria-invalid": ariaInvalid,
    ...aria
  },
  ref,
) {
  const labels = useUiLabels();
  const locale = localeProp ?? labels.locale;
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [rawValue, setValue] = useControllableState(
    valueProp === null ? "" : valueProp,
    defaultValue,
    onChange,
  );
  const minutes = parseTime(rawValue);
  const minMinutes = parseTime(min);
  const maxMinutes = parseTime(max);
  const options = useMemo(
    () => timeSteps(minuteStep, minMinutes, maxMinutes),
    [minuteStep, minMinutes, maxMinutes],
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  // The option the list is scrolled to, and whether the arrow keys or the
  // pointer have moved onto it since the last keystroke. Only then is it
  // highlighted and taken by Enter: a typed 07.40 must not turn into the
  // next suggestion, 07.45, just because the list scrolled there.
  const [active, setActive] = useState(-1);
  const [navigated, setNavigated] = useState(false);
  const [scrollMode, setScrollMode] = useState<"center" | "nearest">("center");

  useEffect(() => {
    if (!open || active < 0) return;
    // Radix positions the popover after mount; scrolling before that frame
    // is lost, so the list would open at the top instead of on the value.
    const frame = requestAnimationFrame(() => {
      keepOptionVisible(listRef.current, active, scrollMode === "center");
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [open, active, scrollMode]);

  const shown = draft ?? (minutes === null ? "" : formatTime(minutes, locale));

  function openList(index: number, byNavigation = false) {
    setScrollMode("center");
    setActive(index);
    setNavigated(byNavigation);
    setOpen(true);
  }

  function choose(option: number) {
    setValue(toTime(option));
    setDraft(null);
    setOpen(false);
  }

  function commitDraft() {
    if (draft === null) return;
    setDraft(null);
    if (draft.trim() === "") {
      if (rawValue !== "") setValue("");
      return;
    }
    const typed = parseTypedTime(draft);
    // Unreadable text falls back to the last valid value instead of
    // wiping it: the field shows what the form will actually submit.
    if (typed === null) return;
    const next = clampMinutes(typed, minMinutes, maxMinutes);
    if (next !== minutes) setValue(toTime(next));
  }

  function step(delta: number) {
    setScrollMode("nearest");
    if (!open) {
      openList(active >= 0 ? active : Math.max(nearestIndex(options, minutes), 0), true);
      return;
    }
    setNavigated(true);
    // The first arrow press lands on the suggestion the list scrolled to.
    if (!navigated && active >= 0) return;
    setActive((index) => Math.min(Math.max(index + delta, 0), options.length - 1));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      step(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      const option = open && navigated ? options[active] : undefined;
      if (option !== undefined) {
        event.preventDefault();
        choose(option);
        return;
      }
      // With the list open, Enter only accepts the typed time; the next
      // Enter submits the form, as it would from a plain field.
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
      commitDraft();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  const showInvalid = isInvalid(invalid, ariaInvalid);
  const highlighted = open && navigated ? active : -1;
  const activeOption = highlighted >= 0 ? `${listId}-${highlighted}` : undefined;

  return (
    <Popover
      open={open && options.length > 0}
      onOpenChange={(next) => {
        if (!next) setOpen(false);
      }}
    >
      <PopoverAnchor asChild>
        <div
          ref={boxRef}
          className={cn(
            FIELD_BOX,
            FIELD_BOX_WITH_INPUT,
            "pr-0.5 md:pr-2",
            showInvalid && FIELD_BOX_INVALID,
            disabled && FIELD_BOX_DISABLED,
            className,
          )}
        >
          <Clock className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
          <input
            ref={ref}
            type="text"
            role="combobox"
            inputMode="numeric"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={activeOption}
            aria-required={required ?? undefined}
            aria-invalid={showInvalid || undefined}
            disabled={disabled}
            placeholder={placeholder ?? labels.timePickerPlaceholder}
            value={shown}
            className={cn(FIELD_INNER_INPUT, "tabular-nums")}
            onChange={(event) => {
              const text = event.target.value;
              setDraft(text);
              setScrollMode("center");
              setNavigated(false);
              const index = nearestIndex(options, parseTypedTime(text));
              if (index >= 0) openList(index);
            }}
            onClick={() => {
              if (!open) openList(nearestIndex(options, minutes));
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              commitDraft();
              setOpen(false);
              onBlur?.();
            }}
            {...aria}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={labels.timePickerShowOptions}
            disabled={disabled}
            className={FIELD_ICON_BUTTON}
            // Keep focus (and the caret) in the input.
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => {
              if (open) setOpen(false);
              else openList(nearestIndex(options, minutes));
              boxRef.current?.querySelector("input")?.focus();
            }}
          >
            <ChevronDown aria-hidden="true" />
          </button>
          {name && (
            <input type="hidden" name={name} value={minutes === null ? "" : toTime(minutes)} />
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={labels.timePickerOptions}
        align="start"
        sideOffset={4}
        collisionPadding={16}
        className="max-h-64 w-(--radix-popover-trigger-width) min-w-32 overflow-y-auto p-1"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (event.target instanceof Node && boxRef.current?.contains(event.target)) {
            event.preventDefault();
          }
        }}
        // Options are never focused (the input keeps focus and points at
        // them with aria-activedescendant), so pointer input is handled once
        // here for the whole list. Mousedown must not steal the focus.
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onMouseMove={(event) => {
          const index = optionIndexOf(event.target);
          if (index !== null && (index !== active || !navigated)) {
            setScrollMode("nearest");
            setActive(index);
            setNavigated(true);
          }
        }}
        onClick={(event) => {
          const index = optionIndexOf(event.target);
          const option = index === null ? undefined : options[index];
          if (option !== undefined) choose(option);
        }}
      >
        {options.map((option, index) => (
          <div
            key={option}
            id={`${listId}-${index}`}
            data-index={index}
            role="option"
            aria-selected={option === minutes}
            className={cn(
              // Same row as Select's options: pill-free, check on the right.
              "relative flex h-11 cursor-pointer items-center rounded-xs px-3 pr-8 text-base tabular-nums text-fg md:h-9",
              index === highlighted && "bg-bg",
            )}
          >
            {formatTime(option, locale)}
            {option === minutes && (
              <Check className="absolute right-3 size-4 text-accent" aria-hidden="true" />
            )}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
});
