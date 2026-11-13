"use client";

import { Search, X } from "lucide-react";
import { forwardRef, useRef, useState } from "react";

import { cn } from "../utils/cn.js";

import { FIELD_ICON_BUTTON, FIELD_ICON_FACE } from "./field-box.js";
import { Input, type InputProps } from "./input.js";
import { useUiLabels } from "./ui-labels.js";

export type SearchInputProps = Omit<InputProps, "type" | "leading"> & {
  /** Called after the clear button or Escape empties the field. */
  onClear?: () => void;
};

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
 * Escape empties a filled box first and only then reaches a surrounding
 * dialog. `className` sizes the box (`max-w-sm`), as before.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className, onChange, onKeyDown, onClear, trailing, ...props },
  ref,
) {
  const labels = useUiLabels();
  const innerRef = useRef<HTMLInputElement | null>(null);
  const controlled = props.value !== undefined;
  const [uncontrolledFilled, setUncontrolledFilled] = useState(
    () => props.defaultValue !== undefined && String(props.defaultValue) !== "",
  );
  const filled = controlled ? String(props.value) !== "" : uncontrolledFilled;

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

  return (
    <Input
      ref={setRefs}
      type="search"
      className={className}
      inputClassName="[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
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
          trailing
        )
      }
      onChange={(event) => {
        if (!controlled) setUncontrolledFilled(event.target.value !== "");
        onChange?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Escape" && event.currentTarget.value !== "") {
          event.preventDefault();
          event.stopPropagation();
          clear();
        }
      }}
      {...props}
    />
  );
});
