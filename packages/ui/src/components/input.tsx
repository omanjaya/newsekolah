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
        "h-9 w-full rounded-xs border border-border bg-surface px-3 text-[14px] text-fg",
        "placeholder:text-fg-muted",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        "focus-visible:border-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid && "border-status-absent",
        className,
      )}
      {...props}
    />
  );
});
