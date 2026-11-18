"use client";

import { Plus } from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "./button.js";
import { EmptyState, type EmptyStateProps } from "./empty-state.js";
import { UiLink } from "./ui-link.js";

export type FirstUseEmptyStateProps = Omit<EmptyStateProps, "action"> & {
  /** The add button's label, naming what it creates ("Tambah siswa"). */
  actionLabel: string;
  /**
   * How loud the add button is. `secondary` (the default) is the outline
   * button: the page header (or the table toolbar) already carries the
   * same create action as the one filled primary on the screen. Pass
   * `primary` only where nothing else on the screen offers the action.
   */
  emphasis?: "primary" | "secondary";
} & (
    | {
        /** Opens the create form in place (a dialog, a sheet). */
        onAction: () => void;
        href?: undefined;
      }
    | {
        /** Goes to the create page; `onAction` still runs first when given. */
        href: string;
        onAction?: () => void;
      }
  );

/**
 * The "nothing here yet" preset: a list that is empty because nothing has
 * been created, whose way forward is creating the first one. It always
 * carries that action, a button with a plus; the title and description name
 * the thing ("Belum ada siswa"). The header carries the primary: the button
 * here is the outline one unless `emphasis="primary"`, so a screen never
 * shows two filled buttons for one action. A screen whose reader cannot
 * create anything uses a plain EmptyState instead.
 */
export function FirstUseEmptyState({
  actionLabel,
  emphasis = "secondary",
  onAction,
  href,
  ...props
}: FirstUseEmptyStateProps): ReactElement {
  const size = props.variant === "compact" ? "sm" : "md";
  return (
    <EmptyState
      {...props}
      action={
        href === undefined ? (
          <Button variant={emphasis} size={size} icon={<Plus />} onClick={onAction}>
            {actionLabel}
          </Button>
        ) : (
          <Button asChild variant={emphasis} size={size} icon={<Plus />}>
            <UiLink href={href} onClick={onAction}>
              {actionLabel}
            </UiLink>
          </Button>
        )
      }
    />
  );
}
