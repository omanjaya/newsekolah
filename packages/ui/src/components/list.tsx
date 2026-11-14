"use client";

import { createContext, useContext, useMemo, type ComponentPropsWithRef } from "react";

import { cn } from "../utils/cn.js";

export type ListVariant = "divided" | "inset" | "plain";

interface ListContextValue {
  variant: ListVariant;
  dense: boolean;
}

const ListContext = createContext<ListContextValue>({ variant: "divided", dense: false });

export function useListContext(): ListContextValue {
  return useContext(ListContext);
}

export interface ListProps extends ComponentPropsWithRef<"ul"> {
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
 * A list of rows (ListRow), its rows inset 16px from its edges. Put
 * straight inside a Card (not in CardContent), it spans the card from edge
 * to edge and lines its rows up with the card's own inset; anywhere deeper
 * (a section, a tab panel, a dialog opened from the card) it is a plain
 * list again. styles.css draws both from `data-card-flush`.
 */
export function List({
  variant = "divided",
  dense = false,
  framed = false,
  className,
  ...props
}: ListProps) {
  const context = useMemo(() => ({ variant, dense }), [variant, dense]);
  return (
    <ListContext.Provider value={context}>
      <ul
        data-slot="list"
        data-card-flush={framed ? undefined : ""}
        className={cn(
          "flex flex-col",
          framed && "overflow-hidden rounded-lg border border-border bg-surface shadow-1",
          className,
        )}
        {...props}
      />
    </ListContext.Provider>
  );
}
