"use client";

import { CountBadge, cn } from "@newsekolah/ui";
import Link from "next/link";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

/*
 * Geometry of the phone's bottom bar (4px grid), shared by every slot:
 *
 *   bar        64px tall (h-16, --shell-mobile-tab-bar) + the home indicator
 *              (safe-area-inset-bottom); each slot 1/5 of the bar's width
 *              (70px at 360, 76px at 390, the row capped at 576px)
 *   tab slot   8px top padding (pt-2)
 *              icon well 56 x 28 (w-14 h-7), radius full: the active pill's
 *                box, the icon (22px, size-5.5) centred in it
 *              4px gap (gap-1)
 *              label, caption role 12/16, never truncated: y 40 to 56
 *              8px left below the label
 *   centre     a 56px round button (size-14) whose top sits 24px above the
 *              bar (-top-6), so it ends 32px into it; ringed 4px in the page
 *              colour (ring-4 ring-bg) so it reads as docked into the bar,
 *              which takes its overhang to 28px; icon 24px (size-6); its
 *              label ends 8px above the bar's bottom like every other
 *              label (y 40 to 56), 8px under the button.
 *              --shell-mobile-tab-raise (globals.css) is that 28px plus 4px
 *              of air, 32px, which the page and sticky bars keep clear of.
 *
 * Every slot presses to 0.96 in 80ms (`tab-press`, globals.css, which
 * reduced motion keeps still). The labels are the registry's short tab
 * labels, chosen to fit five slots on a 360px phone.
 */
const SLOT_BASE =
  "tab-press relative flex h-16 w-full min-w-0 flex-col items-center rounded-md px-0.5 text-caption whitespace-nowrap select-none";

const TAB_SLOT = cn(SLOT_BASE, "gap-1 pt-2 focus-visible:-outline-offset-2");

/** Inactive tabs are calm (muted, medium); the active one takes the accent and the label role's weight. */
function slotState(active: boolean | undefined) {
  return active ? "font-semibold text-accent" : "font-medium text-fg-muted active:text-fg";
}

/**
 * The 56 x 28 well around a tab's icon (`data-tab-icon`). The sliding pill
 * (MobileTabBar) paints the active one; until that pill is placed (the
 * server render, a page without script) the well paints itself. An active
 * icon reads as filled without leaving Lucide (`tab-icon-active`,
 * globals.css: a heavier stroke and a low tint inside closed shapes).
 */
function TabIcon({
  active,
  badge,
  children,
}: {
  active: boolean | undefined;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      data-tab-icon=""
      className={cn(
        "relative flex h-7 w-14 shrink-0 items-center justify-center rounded-full transition-colors [&>svg]:size-5.5 [&>svg]:shrink-0",
        active && "tab-icon-active bg-accent-soft [[data-indicator=ready]_&]:bg-transparent",
      )}
    >
      {children}
      {badge}
    </span>
  );
}

/**
 * The count of pending items on a tab's icon, at the icon's top right
 * edge, cut out of the bar by a ring in the bar's colour. Nothing at zero.
 */
export function TabBadge({ count, label }: { count: number; label: string }): ReactNode {
  return (
    <CountBadge
      count={count}
      tone="accent"
      aria-label={label}
      className="absolute -top-1 left-[calc(50%+0.25rem)] ring-2 ring-surface"
    />
  );
}

/** A tab that opens a sheet (Menu). Typed from the button's own props so a Radix trigger can pass its handlers and ref through. */
export const TabSlot = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & {
    icon: ReactNode;
    label: string;
    active?: boolean;
    /** A `TabBadge` for what waits behind the sheet. */
    badge?: ReactNode;
  }
>(function TabSlot({ icon, label, active, badge, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(TAB_SLOT, slotState(active), className)}
      {...props}
    >
      <TabIcon active={active} badge={badge}>
        {icon}
      </TabIcon>
      <span>{label}</span>
    </button>
  );
});

/** A tab that navigates. */
export function TabLink({
  href,
  icon,
  label,
  active,
  badge,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  /** A `TabBadge` for the destination's pending items. */
  badge?: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(TAB_SLOT, slotState(active))}
    >
      <TabIcon active={active} badge={badge}>
        {icon}
      </TabIcon>
      <span>{label}</span>
    </Link>
  );
}

/*
 * The centre slot. The focus ring goes round the round button rather than
 * the slot, since the button is what the eye reads as the control. Its
 * label is a tab label like the others (muted and medium until current):
 * the raised accent button already makes the centre the loudest thing in
 * the bar, and a heavier, darker label read as the selected tab.
 */
const CENTRE_SLOT = cn(SLOT_BASE, "group justify-end pb-2 focus-visible:outline-none");

const CENTRE_BUTTON =
  "absolute -top-6 left-1/2 flex size-14 -translate-x-1/2 items-center justify-center rounded-full bg-accent text-accent-fg shadow-2 ring-4 ring-bg transition-colors group-active:bg-accent-strong group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-focus-ring [&>svg]:size-6 [&>svg]:shrink-0";

function CentreFace({
  icon,
  label,
  current,
  badge,
}: {
  icon: ReactNode;
  label: string;
  current?: boolean;
  badge?: ReactNode;
}) {
  return (
    <>
      <span aria-hidden="true" data-tab-centre="" className={CENTRE_BUTTON}>
        {icon}
        {badge}
      </span>
      <span className={slotState(current)}>{label}</span>
    </>
  );
}

/**
 * The count on the centre button: the surface colour with accent figures,
 * so it stands off the accent button, at the button's top right. It is
 * drawn inside the button's hidden face, so the caller says the count in
 * the slot's accessible name instead.
 */
export function CentreBadge({ count }: { count: number }): ReactNode {
  return (
    <CountBadge
      count={count}
      tone="accent"
      className="absolute -top-0.5 -right-0.5 bg-surface text-accent shadow-1 ring-2 ring-bg"
    />
  );
}

interface CentreProps {
  icon: ReactNode;
  /** The short label under the button. */
  label: string;
  /** The accessible name; it contains `label` (WCAG 2.5.3), and the count when there is a badge. */
  name: string;
  badge?: ReactNode;
}

/** The raised centre action as a link. */
export function CentreLink({
  href,
  current,
  icon,
  label,
  name,
  badge,
}: CentreProps & { href: string; current: boolean }) {
  return (
    <Link
      href={href}
      aria-label={name}
      aria-current={current ? "page" : undefined}
      className={CENTRE_SLOT}
    >
      <CentreFace icon={icon} label={label} current={current} badge={badge} />
    </Link>
  );
}

/** The raised centre action as a button (the quick-action sheet's trigger). */
export const CentreButton = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & CentreProps
>(function CentreButton({ icon, label, name, badge, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={name}
      className={cn(CENTRE_SLOT, className)}
      {...props}
    >
      <CentreFace icon={icon} label={label} badge={badge} />
    </button>
  );
});
