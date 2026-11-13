import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "../utils/cn.js";

import { FIELD_BORDER_CLASSES } from "./field-styles.js";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid ?? undefined}
      className={cn(
        // 44px on a touch screen, 36 once there is a cursor, matching how
        // Button sizes itself. A field is tapped as often as a button is.
        "h-11 md:h-9 w-full rounded-md bg-surface px-3 text-body text-fg",
        // Rest, hover, focus and invalid borders (see field-styles.ts).
        FIELD_BORDER_CLASSES,
        "placeholder:text-fg-muted",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
