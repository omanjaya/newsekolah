"use client";

import { X } from "lucide-react";
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "../utils/cn.js";

import { CALENDAR_BACK_SELECTOR } from "./calendar-month-grid.js";
import {
  FIELD_BOX,
  FIELD_BOX_BUTTON,
  FIELD_BOX_INVALID,
  FIELD_ICON_BUTTON,
  FIELD_ICON_FACE,
} from "./field-box.js";
import { PopoverTrigger } from "./popover.js";

/**
 * Classes for a picker's `PopoverContent`. The height cap keeps every row
 * reachable when neither side of the field has room for the whole calendar
 * (a phone, a short or scroll-locked Dialog): Radix places the popover
 * `fixed` and does not slide it over its field, so without the cap the
 * last weeks would be cut off.
 */
export const PICKER_POPOVER =
  "max-h-(--radix-popover-content-available-height) overflow-y-auto p-3";

/**
 * `onOpenAutoFocus` for a picker's popover: focus the grid's roving cell.
 * Radix calls it once the popover's focus scope is active, which pauses a
 * surrounding Dialog or Sheet focus trap. Focusing from the grid's own
 * mount effect comes before that, and the trap would pull focus straight
 * back to the field.
 */
export function focusPickerGrid(event: Event): void {
  event.preventDefault();
  if (!(event.currentTarget instanceof HTMLElement)) return;
  event.currentTarget.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')?.focus();
}

/**
 * `onEscapeKeyDown` for a picker's popover: in a month or year view Escape
 * goes back a level, which the grid does itself once Radix is kept from
 * closing the popover first. Anywhere else Escape closes the picker.
 */
export function keepEscapeForCalendarView(event: globalThis.KeyboardEvent): void {
  if (event.target instanceof Element && event.target.closest(CALENDAR_BACK_SELECTOR)) {
    event.preventDefault();
  }
}

/** The ARIA and form props every picker forwards to its trigger. */
export interface PickerFieldAriaProps {
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  /** Set by `FormControl`; same effect as `invalid`. */
  "aria-invalid"?: ButtonHTMLAttributes<HTMLButtonElement>["aria-invalid"];
}

interface PickerFieldProps extends PickerFieldAriaProps {
  open: boolean;
  /** Id the picker gives its `PopoverContent`, so the combobox can point at it. */
  contentId: string;
  icon: ReactNode;
  /** The formatted value; "" shows the placeholder. */
  text: string;
  placeholder: string;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Present when the value may be cleared and there is one to clear. */
  onClear?: () => void;
  clearLabel: string;
  onOpen: () => void;
  onBlur?: () => void;
  /** Hidden inputs so a native form post carries the value. */
  hiddenInputs?: { name: string; value: string }[];
  className?: string;
}

export function isInvalid(invalid: boolean | undefined, ariaInvalid: unknown): boolean {
  return invalid ?? (ariaInvalid === true || ariaInvalid === "true");
}

/**
 * The field-shaped trigger the date, range and month pickers share: it
 * sits in a form exactly like `Select`, a select-only combobox whose text
 * is the formatted value and whose label comes from `<label htmlFor>`.
 * Must render inside the picker's `Popover`.
 */
export const PickerField = forwardRef<HTMLButtonElement, PickerFieldProps>(function PickerField(
  {
    open,
    contentId,
    icon,
    text,
    placeholder,
    invalid,
    disabled,
    required,
    onClear,
    clearLabel,
    onOpen,
    onBlur,
    hiddenInputs,
    className,
    "aria-invalid": ariaInvalid,
    ...aria
  },
  ref,
): ReactElement {
  const showInvalid = isInvalid(invalid, ariaInvalid);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    // `className` sizes the field, so a caller's `w-48` keeps the clear
    // button inside the box it belongs to.
    <div className={cn("relative w-full", className)}>
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={contentId}
          disabled={disabled}
          aria-required={required ?? undefined}
          aria-invalid={showInvalid || undefined}
          className={cn(
            FIELD_BOX,
            FIELD_BOX_BUTTON,
            showInvalid && FIELD_BOX_INVALID,
            onClear && "pr-11 md:pr-9",
          )}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          {...aria}
        >
          <span className="flex shrink-0 text-fg-muted [&>svg]:size-4" aria-hidden="true">
            {icon}
          </span>
          <span className={cn("min-w-0 flex-1 truncate tabular-nums", !text && "text-fg-muted")}>
            {text || placeholder}
          </span>
        </button>
      </PopoverTrigger>
      {onClear && !disabled && (
        <button
          type="button"
          aria-label={clearLabel}
          // right-0 (phone) and right-2 put the icon's centre where
          // Select's chevron sits; my-0 because a margin would shift an
          // absolutely placed button off centre.
          className={cn(
            FIELD_ICON_BUTTON,
            "absolute right-0 top-1/2 my-0 -translate-y-1/2 md:right-2",
          )}
          onClick={(event) => {
            // This button unmounts with the value; hand focus back to the
            // field instead of dropping it on <body>.
            event.currentTarget.parentElement
              ?.querySelector<HTMLButtonElement>("[role=combobox]")
              ?.focus();
            onClear();
          }}
        >
          <span className={FIELD_ICON_FACE}>
            <X aria-hidden="true" />
          </span>
        </button>
      )}
      {hiddenInputs?.map((input) => (
        <input key={input.name} type="hidden" name={input.name} value={input.value} />
      ))}
    </div>
  );
});
