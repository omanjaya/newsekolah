"use client";

import { Slot } from "@radix-ui/react-slot";
import { ChevronDown } from "lucide-react";
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

import { useControllableState } from "../hooks/use-controllable-state.js";
import { cn } from "../utils/cn.js";

interface DisclosureContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  contentId: string;
  disabled: boolean;
}

const DisclosureContext = createContext<DisclosureContextValue | null>(null);

function useDisclosure(part: string): DisclosureContextValue {
  const context = useContext(DisclosureContext);
  if (!context) throw new Error(`${part} must be used inside a Disclosure`);
  return context;
}

export interface DisclosureProps {
  /** Controlled open state; pair it with `onOpenChange`. */
  open?: boolean;
  /** The first state when uncontrolled. Default closed. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The trigger stops toggling; the content keeps its current state. */
  disabled?: boolean;
  children: ReactNode;
}

/**
 * A section that opens and closes under its own trigger: a permission
 * group, a stage of a workflow, "Lanjutan" fields. No DOM of its own: it
 * ties one `DisclosureTrigger` (a real button with `aria-expanded` and
 * `aria-controls`) to one `DisclosureContent`, which stays in the page
 * while closed but `hidden`, so it is out of the tab order and the
 * accessibility tree, and what was typed in it is kept. Open and close
 * are instant; only `DisclosureIndicator` turns (200ms, transform only).
 *
 * ```tsx
 * <Disclosure>
 *   <DisclosureTrigger className="flex items-center gap-2">
 *     Lanjutan <DisclosureIndicator />
 *   </DisclosureTrigger>
 *   <DisclosureContent>...</DisclosureContent>
 * </Disclosure>
 * ```
 */
export function Disclosure({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  children,
}: DisclosureProps): ReactElement {
  const [open, setOpen] = useControllableState(openProp, defaultOpen, onOpenChange);
  const contentId = useId();
  return (
    <DisclosureContext.Provider value={{ open, setOpen, contentId, disabled }}>
      {children}
    </DisclosureContext.Provider>
  );
}

export interface DisclosureTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Renders onto the single child element instead of a `<button>`. */
  asChild?: boolean;
}

/**
 * The button that opens and closes the content. It carries no look of its
 * own beyond a pointer and the focus ring every control gets: the caller
 * lays out what it holds (a title, a count, the indicator).
 */
export const DisclosureTrigger = forwardRef<HTMLButtonElement, DisclosureTriggerProps>(
  function DisclosureTrigger({ asChild = false, className, onClick, disabled, ...props }, ref) {
    const {
      open,
      setOpen,
      contentId,
      disabled: groupDisabled,
    } = useDisclosure("DisclosureTrigger");
    const Component = asChild ? Slot : "button";
    const isDisabled = disabled ?? groupDisabled;
    return (
      <Component
        ref={ref}
        type={asChild ? undefined : "button"}
        aria-expanded={open}
        aria-controls={contentId}
        data-state={open ? "open" : "closed"}
        disabled={isDisabled}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) setOpen(!open);
        }}
        className={cn(
          "cursor-pointer text-left focus-visible:outline-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

export interface DisclosureContentProps extends HTMLAttributes<HTMLDivElement> {
  /** Renders onto the single child element (a `ul`, a `section`) instead of a `<div>`. */
  asChild?: boolean;
}

/** What the trigger shows and hides; `hidden` while closed, never unmounted. */
export const DisclosureContent = forwardRef<HTMLDivElement, DisclosureContentProps>(
  function DisclosureContent({ asChild = false, ...props }, ref) {
    const { open, contentId } = useDisclosure("DisclosureContent");
    const Component = asChild ? Slot : "div";
    return (
      <Component
        ref={ref}
        {...props}
        id={contentId}
        hidden={!open}
        data-state={open ? "open" : "closed"}
      />
    );
  },
);

/**
 * The chevron that says which way the section goes: down while closed,
 * turned up while open. Decorative; the trigger's `aria-expanded` is what
 * assistive tech reads.
 */
export function DisclosureIndicator({ className }: { className?: string }): ReactElement {
  const { open } = useDisclosure("DisclosureIndicator");
  return (
    <ChevronDown
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0 text-fg-muted motion-indicator",
        open && "rotate-180",
        className,
      )}
    />
  );
}
