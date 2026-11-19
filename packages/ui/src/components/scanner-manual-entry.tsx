"use client";

import { Keyboard } from "lucide-react";
import { useEffect, useRef, type ReactElement, type RefObject } from "react";

import { cn } from "../utils/cn.js";

import { Button } from "./button.js";
import { Field } from "./field.js";
import { Input } from "./input.js";
import { useUiLabels } from "./ui-labels.js";

/** Long enough for "sion:<kind>:<uuid>:<token>" (93 characters); see BarcodeScannerField. */
const MANUAL_ENTRY_MAX_LENGTH = 128;

/** A mouse or trackpad: a keyboard is likely at hand and focusing a field opens no on-screen one. */
function hasFinePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
}

/** The `Scanner`'s typed fallback: a code field and its button, optionally behind a toggle. */
export function ScannerManualEntry({
  kiosk,
  open,
  collapsible,
  onToggle,
  value,
  onChange,
  onSubmit,
  entryRef,
  focusOnMount,
  attempted,
  check,
  isScanPending,
  disabled,
  label,
  placeholder,
  submitLabel,
}: {
  kiosk: boolean;
  open: boolean;
  collapsible: boolean;
  onToggle: () => void;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /**
   * The form convention: the button stays enabled on an empty field, and
   * pressing it says what is missing and puts the caret back in the field.
   * The Scanner owns this state and clears it on every accepted scan.
   */
  entryRef: RefObject<HTMLDivElement | null>;
  /** See `ScannerProps.focusEntryOnMount`. */
  focusOnMount: boolean;
  attempted: boolean;
  check: (valid: boolean) => boolean;
  /** A hardware scanner just typed here: its Enter is the scanner hook's, not this field's. */
  isScanPending: () => boolean;
  disabled: boolean;
  label: string;
  placeholder: string;
  submitLabel: string;
}): ReactElement {
  const labels = useUiLabels();
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const empty = value.trim() === "";
  useEffect(() => {
    if (!focusOnMount) return;
    if (open && hasFinePointer()) inputRef.current?.focus();
    else toggleRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on mount only: the host remounts the scanner to ask again
  }, []);
  // Opening the fallback (from the toggle or a camera that cannot be used)
  // puts the caret in it; a field shown from the start waits for a tap.
  useEffect(() => {
    if (open && collapsible) inputRef.current?.focus();
  }, [open, collapsible]);
  const submit = () => {
    // A send clears the message (the field empties after it, which is not a
    // new mistake to flag), as does any scan from the camera or a scanner.
    if (!check(!empty)) return;
    onSubmit();
  };
  return (
    <div className="flex flex-col gap-3">
      {collapsible && (
        <Button
          ref={toggleRef}
          variant="ghost"
          size={kiosk ? "md" : "sm"}
          icon={<Keyboard />}
          aria-expanded={open}
          onClick={onToggle}
          className={cn("self-center text-accent", kiosk && "text-body")}
        >
          {open ? labels.scannerManualHide : labels.scannerManualEntry}
        </Button>
      )}
      {open && (
        // The field and its button share one row inside the Field at every
        // width, so the message under the field sits right below it, never
        // under a button stacked between them.
        <div ref={entryRef} className={cn(collapsible && "animate-enter")}>
          <Field
            label={label}
            error={attempted && empty ? labels.scannerManualRequired : undefined}
            className={cn(kiosk && "[&_label]:text-heading")}
          >
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={value}
                autoComplete="off"
                spellCheck={false}
                maxLength={MANUAL_ENTRY_MAX_LENGTH}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(event) => {
                  onChange(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  // A hardware scan typed into this field is reported once, by
                  // the page-wide listener, as a "scanner" scan.
                  if (!isScanPending()) submit();
                }}
                className={cn(
                  "min-w-0 flex-1",
                  kiosk && "h-16 px-4 text-title-lg font-sans font-normal md:pointer-fine:h-16",
                )}
              />
              <Button
                disabled={disabled}
                onClick={submit}
                className={cn("shrink-0", kiosk && "h-16 px-5 text-heading sm:px-8 md:h-16")}
              >
                {submitLabel}
              </Button>
            </div>
          </Field>
        </div>
      )}
    </div>
  );
}
