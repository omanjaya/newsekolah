"use client";

import { CircleAlert } from "lucide-react";
import {
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
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

export type FieldOrientation = "vertical" | "horizontal" | "inline";

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
   * line, for settings pages; it stacks on a phone. "inline" keeps the
   * label and a small control (a Switch) on one line at every width, the
   * control right after the label, for a toggle in a toolbar.
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
   * One control per Field: the first shared control inside owns it, and a
   * later one (an end time beside a start time, an Input in a popover
   * opened from the field) keeps its own id and state. For a group (two
   * pickers, radios) use the render prop and name the group with
   * `aria-labelledby={labelId}`.
   */
  children: ReactNode | ((control: FieldRenderProps) => ReactNode);
}

/** A message slot renders only for content: `false`, `null` and "" (a cleared error) leave it out. */
function isShown(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== "";
}

interface FieldOwner {
  /** The first control to register, which owns the label, or null before any has. */
  token: object | null;
  /** The owner's own `id`, when it brings one. */
  ownId: string | undefined;
  register: (token: object) => () => void;
  reportId: (token: object, id: string | undefined) => void;
}

/**
 * Tracks the controls that mount inside a Field in the order they register
 * (children's layout effects run in tree order), so the first one owns the
 * field and keeps owning it until it unmounts.
 */
function useFieldOwner(): FieldOwner {
  const order = useRef<object[]>([]);
  const ids = useRef(new Map<object, string | undefined>());
  const [owner, setOwner] = useState<{ token: object; ownId: string | undefined } | null>(null);

  const sync = useCallback(() => {
    const first = order.current[0];
    const next = first === undefined ? null : { token: first, ownId: ids.current.get(first) };
    setOwner((current) =>
      current?.token === next?.token && current?.ownId === next?.ownId ? current : next,
    );
  }, []);
  const register = useCallback(
    (token: object) => {
      order.current = [...order.current, token];
      sync();
      return () => {
        order.current = order.current.filter((entry) => entry !== token);
        ids.current.delete(token);
        sync();
      };
    },
    [sync],
  );
  const reportId = useCallback(
    (token: object, id: string | undefined) => {
      ids.current.set(token, id);
      sync();
    },
    [sync],
  );
  return { token: owner?.token ?? null, ownId: owner?.ownId, register, reportId };
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
  const owner = useFieldOwner();
  const controlId = idProp ?? owner.ownId ?? `${baseId}-control`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const labelId = `${baseId}-label`;

  const error = errorProp ?? formField?.error;
  const hasError = isShown(error);
  const hasHint = isShown(hint);
  const describedBy =
    [hasHint && hintId, hasError && errorId].filter(Boolean).join(" ") || undefined;

  const ownedByRenderProp = typeof children === "function";
  const { token: ownerToken, register, reportId } = owner;
  const context = useMemo<FieldContextValue>(
    () => ({
      controlId,
      labelId,
      describedBy,
      invalid: hasError,
      required,
      disabled,
      owner: ownerToken,
      ownedByRenderProp,
      register,
      reportId,
    }),
    [
      controlId,
      labelId,
      describedBy,
      hasError,
      required,
      disabled,
      ownerToken,
      ownedByRenderProp,
      register,
      reportId,
    ],
  );

  const horizontal = orientation === "horizontal";
  const inline = orientation === "inline";
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
          // Scrolled to (the first invalid field on submit, see
          // useSubmitValidation), the label stays below the page's sticky
          // header and the error above its fixed bottom bars, with room
          // for the focus ring. The app shell sets both insets on its
          // scrolling page; a dialog, portalled outside it, keeps the air.
          "scroll-mt-[calc(var(--scroll-inset-top,0px)+var(--space-2))] scroll-mb-[calc(var(--scroll-inset-bottom,0px)+var(--space-2))]",
          horizontal &&
            "sm:grid sm:grid-cols-[minmax(8rem,14rem)_minmax(0,1fr)] sm:gap-x-6 sm:gap-y-1",
          inline && "flex-row flex-wrap items-center gap-x-3 gap-y-1",
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
        <div className={cn("min-w-0", horizontal && "sm:col-start-2", inline && "flex")}>
          {control}
        </div>
        {(hasHint || hasError) && (
          <div
            className={cn(
              "-mt-1 flex flex-col gap-1",
              horizontal && "sm:col-start-2 sm:mt-0",
              inline && "mt-0 basis-full",
            )}
          >
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
