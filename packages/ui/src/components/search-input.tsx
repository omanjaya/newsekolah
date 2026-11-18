"use client";

import { Search, X } from "lucide-react";
import { forwardRef, useEffect, useRef, useState } from "react";

import { cn } from "../utils/cn.js";

import { FIELD_ICON_BUTTON, FIELD_ICON_FACE } from "./field-box.js";
import { Input, type InputProps } from "./input.js";
import { useUiLabels } from "./ui-labels.js";

export type SearchInputProps = Omit<InputProps, "type" | "leading"> & {
  /** Called after the clear button or Escape empties the field. */
  onClear?: () => void;
};

/** Hides the browser's own clear button, so there are never two. */
const NATIVE_SEARCH_CHROME =
  "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none";

/** Sets an input's value the way typing does, so React's `onChange` fires for controlled fields too. */
function clearNativeInput(input: HTMLInputElement): void {
  // The prototype's setter, not `input.value = ""`: React tracks the
  // instance property and would swallow the event as "no change".
  Reflect.set(HTMLInputElement.prototype, "value", "", input);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * The search box: a leading glass, `type="search"` semantics, and one
 * clear button (the browser's own is hidden, so there are never two).
 * Escape in a filled box empties it, before a surrounding dialog, sheet or
 * popover sees the key; in an empty box Escape goes on to close them.
 * `className` sizes the box (`max-w-sm`), as before.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className, inputClassName, onChange, onClear, trailing, ...props },
  ref,
) {
  const labels = useUiLabels();
  const innerRef = useRef<HTMLInputElement | null>(null);
  const controlled = props.value !== undefined;
  const [uncontrolledFilled, setUncontrolledFilled] = useState(
    () => props.defaultValue !== undefined && String(props.defaultValue) !== "",
  );
  const filled = controlled ? String(props.value) !== "" : uncontrolledFilled;
  const onClearRef = useRef(onClear);
  useEffect(() => {
    onClearRef.current = onClear;
  });

  const setRefs = (element: HTMLInputElement | null) => {
    innerRef.current = element;
    if (typeof ref === "function") ref(element);
    else if (ref) ref.current = element;
  };

  const clear = () => {
    const input = innerRef.current;
    if (!input) return;
    clearNativeInput(input);
    input.focus();
    onClear?.();
  };

  // Radix closes its Dialog, Sheet and Popover on an Escape it hears on
  // `document` in the capture phase, before this input's own handlers run.
  // A capture listener on `window` hears it first, and stops it only while
  // this box has focus and something to clear.
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      const input = innerRef.current;
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      if (!input || event.target !== input || input.value === "" || input.readOnly) return;
      event.preventDefault();
      event.stopPropagation();
      clearNativeInput(input);
      onClearRef.current?.();
    };
    window.addEventListener("keydown", onEscape, { capture: true });
    return () => {
      window.removeEventListener("keydown", onEscape, { capture: true });
    };
  }, []);

  return (
    <Input
      ref={setRefs}
      type="search"
      className={className}
      inputClassName={cn(NATIVE_SEARCH_CHROME, inputClassName)}
      leading={<Search aria-hidden="true" />}
      trailing={
        filled && !props.disabled && !props.readOnly ? (
          <button
            type="button"
            aria-label={labels.searchClear}
            className={cn(FIELD_ICON_BUTTON, "-mr-3 md:pointer-fine:-mr-1")}
            onClick={clear}
          >
            <span className={FIELD_ICON_FACE}>
              <X aria-hidden="true" />
            </span>
          </button>
        ) : (
          (trailing ?? null)
        )
      }
      onChange={(event) => {
        if (!controlled) setUncontrolledFilled(event.target.value !== "");
        onChange?.(event);
      }}
      {...props}
    />
  );
});
