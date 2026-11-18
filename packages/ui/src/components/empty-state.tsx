"use client";

import {
  createContext,
  useContext,
  type ComponentPropsWithRef,
  type PropsWithChildren,
  type ReactNode,
} from "react";

import { cn } from "../utils/cn.js";

import { useCardContext } from "./card-context.js";
import { IconCircle } from "./icon-circle.js";
import type { Tone } from "./tone.js";

export type EmptyStateVariant = "framed" | "inline" | "compact";

const FramedSurfaceContext = createContext(false);

/**
 * Marks a container that already draws a frame (a table body, a panel),
 * so a default `framed` EmptyState inside it renders `inline` instead of a
 * frame inside a frame. Card does this for its own children.
 */
export function EmptyStateInlineScope({ children }: PropsWithChildren) {
  return <FramedSurfaceContext.Provider value>{children}</FramedSurfaceContext.Provider>;
}

export interface EmptyStateProps extends Omit<ComponentPropsWithRef<"div">, "title" | "children"> {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** The way forward: every empty list needs one (docs/05-shared-components.md, "Setiap daftar wajib memberi aksi"). */
  action?: ReactNode;
  /** A quieter second way forward, shown after `action` (a text link, a secondary button). */
  secondaryAction?: ReactNode;
  /**
   * `framed` is its own surface for an empty page region; `inline` drops
   * the frame for inside a card, a table or a panel; `compact` is one
   * left-aligned row for a small card on a home screen. Unset, it is
   * `inline` inside a Card or an EmptyStateInlineScope and `framed` elsewhere.
   */
  variant?: EmptyStateVariant;
  /** Tints the icon circle; neutral by default, since the accent is for actions. */
  tone?: Tone;
  /** Heading level of the title, for when the empty state stands in for a titled section. */
  titleAs?: "h2" | "h3" | "h4" | "p";
}

const FRAME_CLASS: Record<EmptyStateVariant, string> = {
  framed: "items-center gap-4 rounded-lg border border-border bg-surface px-6 py-10 text-center",
  inline: "items-center gap-4 px-6 py-8 text-center",
  // The row wraps so that on a phone its action can take a line of its
  // own under the text instead of squeezing it (see the action row below).
  compact: "flex-row flex-wrap items-center gap-3 py-2 text-left",
};

/**
 * An empty list or region: icon in a soft circle, a title on the heading
 * role, one sentence, and its actions. Never a frame inside a frame.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant,
  tone = "neutral",
  titleAs: Title = "p",
  className,
  ...props
}: EmptyStateProps) {
  const card = useCardContext();
  const inFrame = useContext(FramedSurfaceContext) || card !== null;
  const look: EmptyStateVariant = variant ?? (inFrame ? "inline" : "framed");
  const compact = look === "compact";
  const hasActions = Boolean(action) || Boolean(secondaryAction);

  return (
    <div className={cn("flex flex-col", FRAME_CLASS[look], className)} {...props}>
      {icon && (
        <IconCircle tone={tone} size={compact ? "sm" : look === "framed" ? "lg" : "md"}>
          {icon}
        </IconCircle>
      )}
      <div className={cn("flex min-w-0 flex-col", compact ? "flex-1 gap-0.5" : "max-w-sm gap-1")}>
        {/* Balanced and pretty wrapping: no one-word last line. */}
        <Title className={cn("text-balance text-fg", compact ? "text-label" : "text-heading")}>
          {title}
        </Title>
        {description && (
          <p className={cn("text-pretty text-fg-muted", compact ? "text-caption" : "text-body-sm")}>
            {description}
          </p>
        )}
      </div>
      {hasActions && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-4 gap-y-2",
            // Compact: beside the text from 640px; on a phone a line of its
            // own under the text, lined up with it past the 32px icon.
            compact
              ? cn("shrink-0 max-sm:basis-full", icon ? "max-sm:pl-11" : undefined)
              : "mt-1 justify-center",
          )}
        >
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
