import { createContext, useContext, useEffect } from "react";

/**
 * What a `Field` hands the control inside it: the id its label points at,
 * the ids of its hint and error, and its invalid, required and disabled
 * state. Every form control reads it through `useFieldControl`, so a
 * control dropped into a `Field` is labelled, described and marked
 * invalid without any props of its own.
 */
export interface FieldContextValue {
  controlId: string;
  /** Space-separated ids of the hint and error, when shown. */
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
  /**
   * A control that brings its own `id` reports it here, and the label
   * follows it, so `<Field><Input id="nis" /></Field>` stays labelled.
   */
  registerControlId: (id: string | undefined) => void;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * The validation state `FormField` (react-hook-form) knows for its field,
 * so a `Field` rendered inside one shows the field's error without being
 * told. The message is already translated.
 */
export interface FormFieldStateValue {
  error: string | undefined;
}

export const FormFieldStateContext = createContext<FormFieldStateValue | null>(null);

export interface FieldControlInput {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  required?: boolean;
  disabled?: boolean;
  /** The control's own `invalid` prop; wins over the field and `aria-invalid`. */
  invalid?: boolean;
}

/** The attributes to spread onto the focusable element. */
export interface FieldControlProps {
  id: string | undefined;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  /**
   * A `Field` marked required says so to assistive tech only; it does not
   * add the native `required` attribute, whose browser bubble would bypass
   * the form's own, translated validation. A control's own `required` is
   * passed through as before.
   */
  "aria-required": true | undefined;
  required: boolean | undefined;
  disabled: boolean | undefined;
}

export interface FieldControl {
  attributes: FieldControlProps;
  /** True when the control should draw its invalid state. */
  invalid: boolean;
}

function isTrue(value: FieldControlInput["aria-invalid"]): boolean {
  return value === true || value === "true";
}

/**
 * Merges a control's own props with its `Field`: the control's explicit
 * values win (`invalid`, then `aria-invalid`, its own `id`), descriptions
 * add up. Outside a `Field` it returns the control's props unchanged.
 */
export function useFieldControl(props: FieldControlInput): FieldControl {
  const field = useContext(FieldContext);
  const ownId = props.id;
  const register = field?.registerControlId;
  useEffect(() => {
    register?.(ownId);
  }, [register, ownId]);

  const invalid = props.invalid ?? (isTrue(props["aria-invalid"]) || (field?.invalid ?? false));
  const describedBy =
    [props["aria-describedby"], field?.describedBy].filter(Boolean).join(" ") || undefined;
  return {
    attributes: {
      id: ownId ?? field?.controlId,
      "aria-describedby": describedBy,
      "aria-invalid": invalid || undefined,
      "aria-required": (props.required ?? false) || (field?.required ?? false) ? true : undefined,
      required: props.required,
      disabled: props.disabled ?? (field?.disabled === true ? true : undefined),
    },
    invalid,
  };
}
