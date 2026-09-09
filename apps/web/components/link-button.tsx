import { cn } from "@newsekolah/ui";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";

/**
 * A workaround, not a preference: `@newsekolah/ui`'s `Button` always renders
 * two top-level children when `asChild` is used (a leading icon/spinner
 * slot, even when both `icon` and `loading` are unset, plus `children`),
 * which Radix `Slot` rejects with "Slot failed to slot onto its children" —
 * see `React.Children.count` in `@radix-ui/react-slot`'s `createSlot`. Every
 * `asChild` usage hits this, regardless of props, so `Button asChild` is
 * unusable as shipped. Reported upstream; the fix is wrapping `children` in
 * Radix's own `<Slottable>` inside Button. Duplicates only the two variants
 * actually used here (docs/05-shared-components.md's "no local button
 * classes" rule is about page-authored one-offs, not a documented package
 * defect workaround).
 */
export function LinkButton({
  href,
  children,
  variant = "secondary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}): ReactElement {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-sm px-4 text-[13px] font-medium",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        variant === "primary"
          ? "bg-accent text-accent-fg hover:opacity-90"
          : "border border-border bg-surface text-fg hover:bg-bg",
      )}
    >
      {children}
    </Link>
  );
}
