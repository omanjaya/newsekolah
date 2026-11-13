"use client";

import { createContext, useContext } from "react";

export type CardPadding = "none" | "sm" | "md" | "lg";
export type CardTone = "default" | "sunken" | "accent-soft" | "raised";

export interface CardContextValue {
  /**
   * `none` when the card adds no inset of its own and its sections
   * (CardHeader, CardContent, CardFooter) carry the 20px one; otherwise the
   * card is padded and its sections line up on that inset instead.
   */
  padding: CardPadding;
  tone: CardTone;
}

const CardContext = createContext<CardContextValue | null>(null);

export const CardContextProvider = CardContext.Provider;

/**
 * The nearest Card around a component, or `null` outside one. Context
 * reaches any depth and crosses portals, so it suits a card section's own
 * look (CardTitle's colour, CardContent's inset); a layout that depends on
 * being a direct child of the card, such as a List spanning it edge to
 * edge, keys off the DOM instead (`data-card-flush`, see styles.css).
 */
export function useCardContext(): CardContextValue | null {
  return useContext(CardContext);
}
