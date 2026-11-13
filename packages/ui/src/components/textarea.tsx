import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "../utils/cn.js";

import { FIELD_BORDER_CLASSES } from "./field-styles.js";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid ?? undefined}
      className={cn(
        "min-h-20 w-full rounded-md bg-surface px-3 py-2 text-body text-fg",
        FIELD_BORDER_CLASSES,
        "placeholder:text-fg-muted",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
