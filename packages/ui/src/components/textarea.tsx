"use client";

import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "../utils/cn.js";

import { useFieldControl } from "./field-context.js";
import { FIELD_BORDER_CLASSES, FIELD_DISABLED_CLASSES } from "./field-styles.js";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
  /**
   * Grows with its content instead of scrolling, from `rows` (default 3)
   * up to `maxRows`, after which it scrolls. The manual resize handle goes
   * away, since the height is no longer the reader's to pick.
   */
  autoResize?: boolean;
  /** With `autoResize`: the tallest it grows before scrolling. Default 10. */
  maxRows?: number;
};

const LINE_HEIGHT_PX = 20; // text-body
const VERTICAL_CHROME_PX = 18; // py-2 plus the 1px border, top and bottom

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    className,
    invalid,
    autoResize = false,
    maxRows = 10,
    rows,
    id,
    required,
    disabled,
    onInput,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    ...props
  },
  ref,
) {
  const { attributes } = useFieldControl({
    id,
    required,
    disabled,
    invalid,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
  });
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const setRefs = (element: HTMLTextAreaElement | null) => {
    innerRef.current = element;
    if (typeof ref === "function") ref(element);
    else if (ref) ref.current = element;
  };

  const minRows = rows ?? 3;
  const fit = useCallback(() => {
    const element = innerRef.current;
    if (!autoResize || !element) return;
    const max = maxRows * LINE_HEIGHT_PX + VERTICAL_CHROME_PX;
    element.style.height = "auto";
    const next = Math.min(element.scrollHeight + 2, max);
    element.style.height = `${next}px`;
    element.style.overflowY = element.scrollHeight + 2 > max ? "auto" : "hidden";
  }, [autoResize, maxRows]);

  // A controlled value can change without an input event (a reset, a
  // template), so the height follows every render's value too.
  useLayoutEffect(fit, [fit, props.value]);

  return (
    <textarea
      ref={setRefs}
      rows={minRows}
      className={cn(
        "block w-full min-w-0 rounded-md bg-surface px-3 py-2 text-body text-fg",
        autoResize ? "resize-none" : "min-h-20 resize-y",
        FIELD_BORDER_CLASSES,
        FIELD_DISABLED_CLASSES,
        "placeholder:text-fg-muted",
        className,
      )}
      onInput={(event) => {
        fit();
        onInput?.(event);
      }}
      {...attributes}
      {...props}
    />
  );
});
