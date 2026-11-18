import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Slottable } from "@radix-ui/react-slot";
import { Check, ChevronRight } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "../utils/cn.js";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

/**
 * One row's look, shared by every item kind. 36px under a mouse, 44px with
 * 14px text on a touch screen. The radius is the panel's 14px minus its
 * 4px padding, so the highlight sits concentric inside the panel. The
 * pointer gets the soft highlight; keyboard focus also gets an inset ring,
 * since a 5% tint alone is hard to follow. A pressed row is always the
 * highlighted one, so the press layer is keyed to both states: a plain
 * `active:` rule sorts before the `data-` one and would never show.
 */
const ITEM_CLASS = cn(
  "relative flex h-9 cursor-pointer items-center gap-2.5 rounded-[calc(var(--radius-md)-4px)] px-2.5 text-body-sm text-fg select-none",
  "pointer-coarse:h-11 pointer-coarse:text-body",
  "transition-colors data-[highlighted]:bg-state-hover data-[highlighted]:active:bg-state-pressed focus-visible:-outline-offset-2",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-muted",
);

const PANEL_CLASS = cn(
  "z-dropdown min-w-48 overflow-y-auto rounded-md border border-border bg-surface-raised p-1 text-fg shadow-2",
  "max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin)",
  "data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out",
  // A closing menu stops taking clicks while it fades out.
  "data-[state=closed]:pointer-events-none!",
);

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, collisionPadding = 8, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(PANEL_CLASS, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

/** A keyboard hint at the end of a row ("Ctrl K"); decorative, the item's action is the same without it. */
export function DropdownMenuShortcut({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      aria-hidden="true"
      className={cn("ml-auto pl-4 text-caption tracking-wide text-fg-muted", className)}
      {...props}
    />
  );
}

export interface DropdownMenuItemProps extends ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Item
> {
  /** "danger" for an action that destroys or removes something (delete, revoke). */
  tone?: "default" | "danger";
  /** A Lucide icon before the label, sized and muted for you. */
  icon?: ReactNode;
  /** A keyboard hint shown at the end of the row. */
  shortcut?: string;
}

// A pressed danger row keeps its danger tint rather than turning grey.
const DANGER_ITEM =
  "text-danger [&>svg]:text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:active:bg-danger-soft data-[highlighted]:text-danger-soft-fg data-[highlighted]:[&>svg]:text-danger-soft-fg";

export const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  function DropdownMenuItem(
    { className, tone = "default", icon, shortcut, children, ...props },
    ref,
  ) {
    return (
      <DropdownMenuPrimitive.Item
        ref={ref}
        className={cn(ITEM_CLASS, tone === "danger" && DANGER_ITEM, className)}
        {...props}
      >
        {icon}
        {/* With `asChild` (an item that is a link), Slottable marks the
            caller's element as the one the item renders as; the icon and
            the shortcut go inside it. */}
        <Slottable>{children}</Slottable>
        {shortcut !== undefined && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
      </DropdownMenuPrimitive.Item>
    );
  },
);

/** Keeps the check in a fixed 16px slot, so labels line up whether or not they are checked. */
function ItemIndicatorSlot({ children }: { children: ReactNode }) {
  return <span className="flex size-4 shrink-0 items-center justify-center">{children}</span>;
}

export const DropdownMenuCheckboxItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.CheckboxItem ref={ref} className={cn(ITEM_CLASS, className)} {...props}>
      <ItemIndicatorSlot>
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4 text-accent" aria-hidden="true" />
        </DropdownMenuPrimitive.ItemIndicator>
      </ItemIndicatorSlot>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
});

export const DropdownMenuRadioItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.RadioItem ref={ref} className={cn(ITEM_CLASS, className)} {...props}>
      <ItemIndicatorSlot>
        <DropdownMenuPrimitive.ItemIndicator>
          <span className="block size-2 rounded-full bg-accent" />
        </DropdownMenuPrimitive.ItemIndicator>
      </ItemIndicatorSlot>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
});

export const DropdownMenuSubTrigger = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(function DropdownMenuSubTrigger({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(ITEM_CLASS, "data-[state=open]:bg-state-hover", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-4 text-fg-muted" aria-hidden="true" />
    </DropdownMenuPrimitive.SubTrigger>
  );
});

export const DropdownMenuSubContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(function DropdownMenuSubContent({ className, sideOffset = 4, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        ref={ref}
        sideOffset={sideOffset}
        className={cn(PANEL_CLASS, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenuSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-line", className)}
      {...props}
    />
  );
});

/** A group heading inside a menu ("Tampilan", "Akun"). */
export const DropdownMenuLabel = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(function DropdownMenuLabel({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn("px-2.5 pt-2 pb-1 text-caption text-fg-muted", className)}
      {...props}
    />
  );
});
