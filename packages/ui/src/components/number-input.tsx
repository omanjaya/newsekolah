"use client";

import { Minus, Plus } from "lucide-react";
import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { useControllableState } from "../hooks/use-controllable-state.js";
import { cn } from "../utils/cn.js";
import {
  clampNumber,
  formatNumber,
  fractionDigitsOf,
  parseNumberText,
  roundTo,
  sanitizeNumberText,
} from "../utils/locale-number.js";

import {
  FIELD_BOX,
  FIELD_BOX_DISABLED,
  FIELD_BOX_INVALID,
  FIELD_BOX_WITH_INPUT,
  FIELD_ICON_BUTTON,
  FIELD_ICON_FACE,
  FIELD_INNER_INPUT,
} from "./field-box.js";
import { isInvalid } from "./picker-field.js";
import { useUiLabels } from "./ui-labels.js";

export interface NumberInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "type" | "min" | "max" | "step" | "prefix" | "size"
> {
  /** The number, or null while the field is empty. */
  value?: number | null;
  defaultValue?: number | null;
  /**
   * Called on every keystroke that changes the number, and once more on
   * blur if rounding or clamping what was typed changed it. A field only
   * tabbed through never calls it. Never NaN.
   */
  onChange?: (value: number | null) => void;
  /** Lower bound for typing and stepping. Set it below 0 to allow negatives on a phone keypad. */
  min?: number;
  max?: number;
  /** Arrow keys and stepper buttons move by this much. Default 1. */
  step?: number;
  /**
   * Fraction digits a typed number is rounded to. Defaults to the step's
   * own (step 0.5 keeps 1, step 1 keeps none). A value that already has
   * more digits is shown in full until someone edits it.
   */
  precision?: number;
  /** Shows minus and plus buttons either side of the number. */
  stepper?: boolean;
  /** Text or an icon before the number, e.g. "Rp". */
  prefix?: ReactNode;
  /** Text after the number, e.g. "hari" or "%". */
  suffix?: ReactNode;
  /** Thousands separators while the field is not being edited ("1.500.000"). Default false. */
  useGrouping?: boolean;
  /** Decimal comma or point; defaults to `UiLabels.locale` ("id-ID" writes "85,5"). */
  locale?: string;
  invalid?: boolean;
  /** Sizes the whole field; the input inside always fills it. */
  className?: string;
  inputClassName?: string;
}

interface Draft {
  /** The text as typed. */
  text: string;
  /** The number the text stood for when typed; if the caller replaces it, the text yields. */
  value: number | null;
  /** Typed into since focus. Only an edited value is rounded and clamped on blur. */
  edited: boolean;
  /** Fraction digits typing may hold: `precision`, or more if the value had more at focus. */
  fractionLimit: number;
}

/**
 * A number field that never hands the caller NaN: typing keeps only what a
 * number can hold, the value is `number | null`, and once someone has typed
 * into it, blur rounds it to `precision` and clamps it to `min`/`max`.
 * Arrow up/down step it. Separators follow the locale ("1.500.000,5" in
 * Indonesian), and a lone "." or "," with few enough digits after it is a
 * decimal point either way, since a phone's keypad offers whichever its
 * region uses.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  {
    value: valueProp,
    defaultValue = null,
    onChange,
    min,
    max,
    step = 1,
    precision: precisionProp,
    stepper,
    prefix,
    suffix,
    useGrouping = false,
    locale: localeProp,
    invalid,
    disabled,
    readOnly,
    id: idProp,
    name,
    className,
    inputClassName,
    onBlur,
    onFocus,
    onKeyDown,
    "aria-invalid": ariaInvalid,
    ...inputProps
  },
  ref,
) {
  const labels = useUiLabels();
  const locale = localeProp ?? labels.locale;
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const precision = precisionProp ?? fractionDigitsOf(step);
  const allowNegative = min === undefined || min < 0;
  const negativeKeypad = min !== undefined && min < 0;
  const [rawValue, setValue] = useControllableState(valueProp, defaultValue, onChange);
  const value = rawValue !== null && Number.isFinite(rawValue) ? rawValue : null;
  const [draft, setDraft] = useState<Draft | null>(null);

  // Rounding is for what someone types, not for a value they only looked
  // at: a stored 85,25 in a step-0.1 field shows as 85,25, not 85,3.
  const digitsOf = (next: number) => Math.min(Math.max(precision, fractionDigitsOf(next)), 20);
  const format = (next: number, grouping: boolean) =>
    formatNumber(next, locale, { precision: digitsOf(next), useGrouping: grouping });
  const editText = (next: number | null) => (next === null ? "" : format(next, false));
  let shown = value === null ? "" : format(value, useGrouping);
  if (draft) shown = draft.value === value ? draft.text : editText(value);

  const normalize = (next: number) => clampNumber(roundTo(next, precision), min, max);

  function stepBy(direction: 1 | -1) {
    const base = value ?? (direction === 1 ? (min ?? 0) - step : (max ?? 0) + step);
    const next = normalize(base + direction * step);
    setValue(next);
    if (draft) setDraft({ ...draft, text: editText(next), value: next });
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || readOnly) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      stepBy(event.key === "ArrowUp" ? 1 : -1);
    }
  }

  const showInvalid = isInvalid(invalid, ariaInvalid);
  const atMin = value !== null && min !== undefined && value <= min;
  const atMax = value !== null && max !== undefined && value >= max;
  const stepperButton = (direction: 1 | -1) => (
    <button
      type="button"
      tabIndex={-1}
      aria-label={direction === 1 ? labels.numberInputIncrement : labels.numberInputDecrement}
      aria-controls={id}
      disabled={Boolean(disabled) || Boolean(readOnly) || (direction === 1 ? atMax : atMin)}
      className={cn(FIELD_ICON_BUTTON, "md:size-7")}
      // A press must not pull focus out of the input mid-edit.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        stepBy(direction);
      }}
    >
      <span className={FIELD_ICON_FACE}>
        {direction === 1 ? <Plus aria-hidden="true" /> : <Minus aria-hidden="true" />}
      </span>
    </button>
  );

  // Between stepper buttons the number and its unit read as one centred
  // "7 hari": the input takes the half beside the unit and aligns towards
  // it, so the whole field stays a click target for the input.
  const hasPrefix = prefix !== undefined;
  const hasSuffix = suffix !== undefined;
  let alignment = "";
  if (stepper) {
    if (hasSuffix && !hasPrefix) alignment = "text-right";
    else if (hasPrefix && !hasSuffix) alignment = "text-left";
    else alignment = "text-center";
  }

  return (
    <div
      className={cn(
        FIELD_BOX,
        FIELD_BOX_WITH_INPUT,
        stepper && "gap-1.5 px-0 md:px-1",
        showInvalid && FIELD_BOX_INVALID,
        disabled && FIELD_BOX_DISABLED,
        className,
      )}
    >
      {stepper && stepperButton(-1)}
      {hasPrefix && (
        <Adornment className={stepper && !hasSuffix ? "flex-1 justify-end" : undefined}>
          {prefix}
        </Adornment>
      )}
      <input
        ref={ref}
        id={id}
        type="text"
        role="spinbutton"
        // The numeric and decimal keypads have no minus key, so a field
        // that is meant to take negatives (an explicit min below 0) gets
        // the full keyboard. An unset min still accepts a typed minus.
        inputMode={negativeKeypad ? "text" : precision > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        aria-valuenow={value ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-invalid={showInvalid || undefined}
        disabled={disabled}
        readOnly={readOnly}
        value={shown}
        className={cn(FIELD_INNER_INPUT, "tabular-nums", alignment, inputClassName)}
        onFocus={(event) => {
          setDraft({
            text: editText(value),
            value,
            edited: false,
            fractionLimit: value === null ? precision : digitsOf(value),
          });
          onFocus?.(event);
        }}
        onChange={(event) => {
          const fractionLimit = draft?.fractionLimit ?? precision;
          const text = sanitizeNumberText(event.target.value, {
            locale,
            precision: fractionLimit,
            allowNegative,
          });
          const next = parseNumberText(text, { locale, precision: fractionLimit });
          setDraft({ text, value: next, edited: true, fractionLimit });
          if (next !== value) setValue(next);
        }}
        onKeyDown={onInputKeyDown}
        onBlur={(event) => {
          const edited = draft?.edited ?? false;
          setDraft(null);
          if (edited && value !== null) {
            const next = normalize(value);
            if (next !== value) setValue(next);
          }
          onBlur?.(event);
        }}
        {...inputProps}
      />
      {hasSuffix && (
        <Adornment className={stepper && !hasPrefix ? "flex-1 justify-start" : undefined}>
          {suffix}
        </Adornment>
      )}
      {stepper && stepperButton(1)}
      {/* The visible text is localised ("85,5"); a form post gets the number. */}
      {name && <input type="hidden" name={name} value={value === null ? "" : String(value)} />}
    </div>
  );
});

function Adornment({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn("flex shrink-0 items-center text-base text-fg-muted [&>svg]:size-4", className)}
    >
      {children}
    </span>
  );
}
