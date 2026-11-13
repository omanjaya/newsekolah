import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "../utils/cn.js";

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
        //
        // The border is the only thing that shows where an empty field is,
        // so it uses `border-strong` (3:1 on every surface); a hover darkens
        // it one step, focus hands over to the accent and the focus ring.
        "h-11 md:h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-body text-fg",
        "placeholder:text-fg-muted",
        "transition-colors hover:border-fg-muted",
        "focus-visible:border-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid && "border-danger",
        className,
      )}
      {...props}
    />
  );
});
