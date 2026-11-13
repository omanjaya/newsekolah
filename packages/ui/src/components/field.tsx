"use client";

import { CircleAlert } from "lucide-react";
import {
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "../utils/cn.js";

import {
  FieldContext,
  FormFieldStateContext,
  type FieldContextValue,
  type FieldControlProps,
} from "./field-context.js";
import { useUiLabels } from "./ui-labels.js";

export type FieldOrientation = "vertical" | "horizontal";

/**
 * What a render-prop child receives: spread it onto a control `Field` does
 * not know. `labelId` names a group (a radio group, a segmented control)
 * with `aria-labelledby`, where a label's `for` cannot point.
 */
export type FieldRenderProps = Pick<
  FieldControlProps,
  "id" | "aria-describedby" | "aria-invalid" | "aria-required"
> & { labelId: string };

export interface FieldProps {
  label: ReactNode;
  /** Help under the control: a format, a consequence, where a value comes from. */
  hint?: ReactNode;
  /**
   * The validation message. Inside react-hook-form's `FormField` the field's
   * own error shows without this prop; passing it overrides that.
   */
  error?: ReactNode;
  /** A red asterisk after the label and `aria-required` on the control. */
  required?: boolean;
  /** "(opsional)" after the label, for a form where most fields are required. */
  optional?: boolean;
  /** Disables the control inside and dims the label. */
  disabled?: boolean;
  /**
   * "vertical" (default) puts the label above the control. "horizontal"
   * puts it in a left column from `sm` up, level with the control's first
   * line, for settings pages; it stacks on a phone.
   */
  orientation?: FieldOrientation;
  /** Keeps the label for assistive tech only, e.g. a field inside a table row. */
  hideLabel?: boolean;
  /** Right end of the label row: a link ("Lupa kata sandi?") or a counter. */
  labelAside?: ReactNode;
  /** The control's id when it should be a known one; otherwise generated. */
  id?: string;
  className?: string;
  /**
   * The control. A shared control (Input, Select, DatePicker...) wires
   * itself; a render prop hands the ids and ARIA state to anything else.
   */
  children: ReactNode | ((control: FieldRenderProps) => ReactNode);
}

/** A message slot renders only for content: `false`, `null` and "" (a cleared error) leave it out. */
function isShown(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== "";
}

/**
 * One labelled form field: label, control, hint and error in a fixed
 * rhythm (8px from label to control, 4px from control to its messages),
 * with the label's `for`, the control's `aria-describedby` and
 * `aria-invalid` wired through context.
 *
 * Replaces the hand-written `<label className="flex flex-col gap-1">
 * <span>Nama</span><Input /></label>`: the span becomes `label`, the
 * input stays the child.
 */
export function Field({
  label,
  hint,
  error: errorProp,
  required = false,
  optional = false,
  disabled = false,
  orientation = "vertical",
  hideLabel = false,
  labelAside,
  id: idProp,
  className,
  children,
}: FieldProps): ReactElement {
  const labels = useUiLabels();
  const formField = useContext(FormFieldStateContext);
  const baseId = useId();
  const [registeredId, setRegisteredId] = useState<string | undefined>(undefined);
  const controlId = idProp ?? registeredId ?? `${baseId}-control`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const labelId = `${baseId}-label`;

  const error = errorProp ?? formField?.error;
  const hasError = isShown(error);
  const hasHint = isShown(hint);
  const describedBy =
    [hasHint && hintId, hasError && errorId].filter(Boolean).join(" ") || undefined;

  const registerControlId = useCallback((id: string | undefined) => {
    setRegisteredId(id);
  }, []);

  const context = useMemo<FieldContextValue>(
    () => ({
      controlId,
      describedBy,
      invalid: hasError,
      required,
      disabled,
      registerControlId,
    }),
    [controlId, describedBy, hasError, required, disabled, registerControlId],
  );

  const horizontal = orientation === "horizontal";
  const control =
    typeof children === "function"
      ? children({
          id: controlId,
          "aria-describedby": describedBy,
          "aria-invalid": hasError || undefined,
          "aria-required": required || undefined,
          labelId,
        })
      : children;

  return (
    <FieldContext.Provider value={context}>
      <div
        data-slot="field"
        data-invalid={hasError || undefined}
        className={cn(
          "flex min-w-0 flex-col gap-2",
          horizontal &&
            "sm:grid sm:grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)] sm:gap-x-6 sm:gap-y-1",
          className,
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-baseline justify-between gap-3",
            // Level with the control's first line: the label row is exactly
            // as tall as a single-line control (see FIELD_HEIGHT).
            horizontal && "sm:min-h-11 sm:items-center md:pointer-fine:min-h-9",
            hideLabel && !labelAside && "sr-only",
          )}
        >
          <label
            id={labelId}
            htmlFor={controlId}
            className={cn(
              "min-w-0 text-label text-fg",
              disabled && "text-fg-muted",
              hideLabel && "sr-only",
            )}
          >
            {label}
            {required && (
              <span aria-hidden="true" className="ml-0.5 text-danger">
                *
              </span>
            )}
            {/* A real space, not a margin, so the accessible name reads "Alamat (opsional)". */}
            {optional && !required && (
              <>
                {" "}
                <span className="text-body-sm text-fg-muted">{labels.fieldOptional}</span>
              </>
            )}
          </label>
          {labelAside !== undefined && (
            <div className="flex shrink-0 items-center text-body-sm">{labelAside}</div>
          )}
        </div>
        <div className={cn("min-w-0", horizontal && "sm:col-start-2")}>{control}</div>
        {(hasHint || hasError) && (
          <div className={cn("-mt-1 flex flex-col gap-1", horizontal && "sm:col-start-2 sm:mt-0")}>
            {hasHint && (
              <p id={hintId} className="text-body-sm text-fg-muted">
                {hint}
              </p>
            )}
            {hasError && <FieldError id={errorId}>{error}</FieldError>}
          </div>
        )}
      </div>
    </FieldContext.Provider>
  );
}

/** The danger line under a control: an icon, so it is not told apart by color alone. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }): ReactElement {
  return (
    <p id={id} className="flex items-start gap-1.5 text-body-sm text-danger">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
