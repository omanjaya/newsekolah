"use client";

import {
  forwardRef,
  useRef,
  type InputHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

import { cn } from "../utils/cn.js";

import { useFieldControl } from "./field-context.js";
import {
  FIELD_BORDER_CLASSES,
  FIELD_DISABLED_CLASSES,
  FIELD_HEIGHT,
  FIELD_PADDING,
  FIELD_SHELL_BORDER_CLASSES,
  FIELD_SHELL_DISABLED_CLASSES,
  FIELD_TEXT,
  type FieldSize,
} from "./field-styles.js";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  invalid?: boolean;
  /**
   * "md" (default) is the form field. "sm" is the compact field for dense
   * toolbars and table filters (32px with a cursor). Both are 44px on a
   * touch screen.
   */
  size?: FieldSize;
  /** An icon or short text before the value, e.g. a search glass or "Rp". */
  leading?: ReactNode;
  /** An icon, unit or small button after the value, e.g. "kg" or a clear button. */
  trailing?: ReactNode;
  /**
   * With `leading` or `trailing`, `className` lands on the box (size it
   * there: `w-48`) and this on the inner `<input>`. Without adornments the
   * input is the box and takes `className` itself.
   */
  inputClassName?: string;
};

/** Adornment slot: icons take the field's muted 16px, text the body size. */
const ADORNMENT = "flex shrink-0 items-center text-fg-muted [&_svg]:size-4";

/**
 * The text field. Reads its label, description and invalid state from a
 * surrounding `Field`; `aria-invalid` (or `invalid`) draws the danger
 * border in every state.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    inputClassName,
    invalid,
    size = "md",
    leading,
    trailing,
    id,
    required,
    disabled,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    ...props
  },
  ref,
) {
  const { attributes: control } = useFieldControl({
    id,
    required,
    disabled,
    invalid,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
  });
  const innerRef = useRef<HTMLInputElement | null>(null);
  const setRefs = (element: HTMLInputElement | null) => {
    innerRef.current = element;
    if (typeof ref === "function") ref(element);
    else if (ref) ref.current = element;
  };

  if (leading === undefined && trailing === undefined) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full min-w-0 rounded-md bg-surface text-fg",
          FIELD_HEIGHT[size],
          FIELD_PADDING[size],
          FIELD_TEXT[size],
          // Rest, hover, focus and invalid borders (see field-styles.ts).
          FIELD_BORDER_CLASSES,
          FIELD_DISABLED_CLASSES,
          "placeholder:text-fg-muted",
          className,
          inputClassName,
        )}
        {...control}
        {...props}
      />
    );
  }

  // A press on the padding or on a decorative icon still focuses the
  // input, as it would on a plain field; a button inside keeps its click.
  const focusInput = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("button, a, input")) return;
    event.preventDefault();
    innerRef.current?.focus();
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- pointer convenience only; the input inside is the focusable control
    <div
      data-slot="input"
      className={cn(
        "flex w-full min-w-0 cursor-text items-center gap-2 rounded-md bg-surface text-fg",
        FIELD_HEIGHT[size],
        FIELD_PADDING[size],
        FIELD_SHELL_BORDER_CLASSES,
        FIELD_SHELL_DISABLED_CLASSES,
        className,
      )}
      onMouseDown={focusInput}
    >
      {leading !== undefined && <span className={ADORNMENT}>{leading}</span>}
      <input
        ref={setRefs}
        className={cn(
          "h-full w-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-muted",
          "focus-visible:outline-none disabled:cursor-not-allowed",
          FIELD_TEXT[size],
          inputClassName,
        )}
        {...control}
        {...props}
      />
      {trailing !== undefined && <span className={ADORNMENT}>{trailing}</span>}
    </div>
  );
});
