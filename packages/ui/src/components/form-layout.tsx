import { CircleAlert } from "lucide-react";
import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "../utils/cn.js";

import { useUiLabels } from "./ui-labels.js";

export interface FormSectionProps extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  /** Right end of the header, e.g. a "Reset to default" link. */
  aside?: ReactNode;
  /**
   * 2 (default): one column until the section is 32rem wide, two after, so
   * a section in a narrow dialog stays one column and a page form gets two.
   * 1 keeps one column at every width. Make a field span both columns with
   * `className="col-span-full"`.
   */
  columns?: 1 | 2;
  /**
   * "plain" (default) separates sections with space only. "card" puts the
   * section on its own surface card, for a settings page made of sections.
   */
  variant?: "plain" | "card";
}

/**
 * A titled group of fields. The grid responds to the section's own width
 * (a container query), not the screen's: the same section reads as one
 * column in a 448px dialog and two on a 720px page.
 */
export function FormSection({
  title,
  description,
  aside,
  columns = 2,
  variant = "plain",
  className,
  children,
  ...props
}: FormSectionProps): ReactElement {
  const titleId = useId();
  const hasHeader = title !== undefined || description !== undefined || aside !== undefined;
  return (
    <section
      aria-labelledby={title !== undefined ? titleId : undefined}
      className={cn(
        "@container flex min-w-0 flex-col gap-4",
        variant === "card" && "rounded-lg border border-border bg-surface p-5 shadow-1 md:p-6",
        className,
      )}
      {...props}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            {title !== undefined && (
              <h2 id={titleId} className="text-heading text-fg">
                {title}
              </h2>
            )}
            {description !== undefined && (
              <p className="max-w-prose text-body-sm text-fg-muted">{description}</p>
            )}
          </div>
          {aside !== undefined && <div className="flex shrink-0 items-center">{aside}</div>}
        </div>
      )}
      <div className={cn("grid gap-x-4 gap-y-5", columns === 2 && "@lg:grid-cols-2")}>
        {children}
      </div>
    </section>
  );
}

export interface FormActionsProps extends ComponentPropsWithoutRef<"div"> {
  /**
   * "end" (default) groups the buttons on the right. "between" puts the
   * first child on the left (a destructive or secondary action) and the
   * rest on the right.
   */
  align?: "end" | "between";
  /**
   * Keeps the row on screen at the bottom of the scrolling page or panel,
   * on the surface with a hairline above it, so the save button never
   * scrolls away under a long form.
   */
  sticky?: boolean;
}

/**
 * The button row at the end of a form. On a phone every button takes an
 * equal share of the row, so each is a full thumb target; from `sm` up
 * they keep their own width. Put the primary action last.
 */
export function FormActions({
  align = "end",
  sticky = false,
  className,
  ...props
}: FormActionsProps): ReactElement {
  return (
    <div
      data-slot="form-actions"
      className={cn(
        "flex flex-wrap items-center gap-2 [&>*]:min-w-0 [&>*]:flex-1 sm:[&>*]:flex-none",
        align === "end" ? "sm:justify-end" : "sm:justify-end sm:[&>*:first-child]:mr-auto",
        sticky &&
          "sticky bottom-0 z-sticky border-t border-line bg-surface py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    />
  );
}

export interface FormErrorProps extends Omit<ComponentPropsWithoutRef<"div">, "title"> {
  /** Defaults to "Periksa kembali isian berikut" (`UiLabels.formErrorTitle`). */
  title?: ReactNode;
  /** One line per problem; rendered as a list. `children` adds free text instead. */
  errors?: ReactNode[];
}

/**
 * The danger summary at the top of a form after a failed submit, or for an
 * error the server returned for the form as a whole. It is announced
 * (`role="alert"`); pass a ref and focus it to move a keyboard user there.
 */
export const FormError = forwardRef<HTMLDivElement, FormErrorProps>(function FormError(
  { title, errors, className, children, ...props },
  ref,
) {
  const labels = useUiLabels();
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={cn(
        "flex gap-3 rounded-md bg-danger-soft p-4 text-danger-soft-fg",
        "focus-visible:outline-offset-2",
        className,
      )}
      {...props}
    >
      <CircleAlert className="mt-px size-4 shrink-0 text-danger" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-label">{title ?? labels.formErrorTitle}</p>
        {errors && errors.length > 0 && (
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-body-sm">
            {errors.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        )}
        {children !== undefined && <div className="text-body-sm">{children}</div>}
      </div>
    </div>
  );
});
