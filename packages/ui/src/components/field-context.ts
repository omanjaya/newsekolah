import { createContext, useContext, useLayoutEffect, useState } from "react";

/**
 * What a `Field` hands the control inside it: the id its label points at,
 * the ids of its hint and error, and its invalid, required and disabled
 * state. Every form control reads it through `useFieldControl`, so a
 * control dropped into a `Field` is labelled, described and marked
 * invalid without any props of its own.
 *
 * A Field labels one control. The first shared control that mounts inside
 * it owns it; any later one (a second picker, an Input inside a popover or
 * dialog opened from the field, since context passes through portals)
 * keeps its own props and only follows `disabled`.
 */
export interface FieldContextValue {
  controlId: string;
  /** Space-separated ids of the hint and error, when shown. */
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
  /** The control that owns the field, or null before any has mounted. */
  owner: object | null;
  /** A render-prop child owns the field, so no shared control inside takes its wiring. */
  ownedByRenderProp: boolean;
  /** Called on mount with a token unique to the control; returns its unregister. */
  register: (token: object) => () => void;
  /**
   * A control that brings its own `id` reports it here, and the label
   * follows the owner's, so `<Field><Input id="nis" /></Field>` stays labelled.
   */
  reportId: (token: object, id: string | undefined) => void;
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
 * add up. Outside a `Field`, or when another control owns the field, it
 * returns the control's props unchanged (only the field's `disabled`
 * still applies).
 */
export function useFieldControl(props: FieldControlInput): FieldControl {
  const context = useContext(FieldContext);
  const [token] = useState(() => ({}));
  const ownId = props.id;
  const register = context?.register;
  const reportId = context?.reportId;
  // Layout effects, so the second control drops the shared id before the
  // first paint rather than one frame after it.
  useLayoutEffect(() => register?.(token), [register, token]);
  useLayoutEffect(() => {
    reportId?.(token, ownId);
  }, [reportId, token, ownId]);

  const owns =
    context !== null &&
    !context.ownedByRenderProp &&
    (context.owner === null || context.owner === token);
  const field = owns ? context : null;

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
      disabled: props.disabled ?? (context?.disabled === true ? true : undefined),
    },
    invalid,
  };
}
