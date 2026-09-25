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
        "h-11 md:h-9 w-full rounded-md border border-border bg-surface px-3 text-[14px] text-fg",
        "placeholder:text-fg-muted",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        "focus-visible:border-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid && "border-danger",
        className,
      )}
      {...props}
    />
  );
});
