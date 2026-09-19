import { Search } from "lucide-react";
import { forwardRef } from "react";

import { cn } from "../utils/cn.js";

import { Input, type InputProps } from "./input.js";

/**
 * A search box is the same field everywhere in the product, so its leading
 * icon and `type="search"` semantics (native clear button, form submit
 * behavior) live here once instead of being hand-rolled per feature.
 */
export const SearchInput = forwardRef<HTMLInputElement, InputProps>(function SearchInput(
  { className, ...props },
  ref,
) {
  // `className` sizes the wrapper, not the input: callers constrain a search
  // box's width (`max-w-sm`), and the input itself must stay full-width
  // inside the wrapper for the icon overlay to line up.
  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden="true"
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
      />
      <Input ref={ref} type="search" className="pl-9" {...props} />
    </div>
  );
});
