import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "../utils/cn.js";

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
        "min-h-20 w-full rounded-xs border border-border bg-surface px-3 py-2 text-[14px] text-fg",
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
