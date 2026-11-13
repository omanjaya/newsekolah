"use client";

import { createContext, useContext, useMemo, type ComponentPropsWithoutRef } from "react";

import { cn } from "../utils/cn.js";

import { CARD_EDGE_CLIP_CLASS, CARD_FLUSH_CLASS, useCardContext } from "./card-context.js";

export type ListVariant = "divided" | "inset" | "plain";

interface ListContextValue {
  variant: ListVariant;
  dense: boolean;
}

const ListContext = createContext<ListContextValue>({ variant: "divided", dense: false });

export function useListContext(): ListContextValue {
  return useContext(ListContext);
}

export interface ListProps extends ComponentPropsWithoutRef<"ul"> {
  /**
   * `divided` (default): full-width 1px rules between rows. `inset`: rules
   * that start at the text, past the leading avatar or icon. `plain`: none.
   */
  variant?: ListVariant;
  /** Shorter rows for a dense tool screen; still 44px under a finger. */
  dense?: boolean;
  /** Draws the list's own card surface; leave it off inside a Card, where the list spans the card edge to edge. */
  framed?: boolean;
}

/**
 * A list of rows (ListRow). Inside a Card it spans the card from edge to
 * edge and aligns its rows with the card's inset; put it straight in the
 * Card, not in CardContent.
 */
export function List({
  variant = "divided",
  dense = false,
  framed = false,
  className,
  ...props
}: ListProps) {
  const card = useCardContext();
  const context = useMemo(() => ({ variant, dense }), [variant, dense]);
  return (
    <ListContext.Provider value={context}>
      <ul
        data-slot="list"
        data-card-flush=""
        className={cn(
          "flex flex-col",
          framed
            ? "overflow-hidden rounded-lg border border-border bg-surface shadow-1 [--list-inset:16px]"
            : card
              ? cn(CARD_FLUSH_CLASS[card.padding], CARD_EDGE_CLIP_CLASS)
              : // 16px on a bare list, the artboard's row padding.
                "[--list-inset:16px]",
          className,
        )}
        {...props}
      />
    </ListContext.Provider>
  );
}
