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

/** The nearest Card around a component, or `null` outside one. */
export function useCardContext(): CardContextValue | null {
  return useContext(CardContext);
}

/*
 * For content that spans a card edge to edge (List, an inline DataList):
 * the card's own inset as `--list-inset`, so the rows' text lines up with
 * the card header. In a padded card the content also bleeds into the
 * padding at a card edge it touches, and pulls closer to a sibling, since
 * its rows bring their own 12px of vertical padding.
 */
export const CARD_FLUSH_CLASS: Record<CardPadding, string> = {
  none: "[--list-inset:20px]",
  sm: "-mx-4 [--list-inset:16px] first:-mt-4 last:-mb-4 not-first:-mt-2 not-last:-mb-2",
  md: "-mx-5 [--list-inset:20px] first:-mt-5 last:-mb-5 not-first:-mt-3 not-last:-mb-3",
  lg: "-mx-6 [--list-inset:24px] first:-mt-6 last:-mb-6 not-first:-mt-3 not-last:-mb-3",
};

/** A row's hover layer follows the card's corners where the content touches them (radius 20 less the 1px ring). */
export const CARD_EDGE_CLIP_CLASS =
  "first:overflow-hidden first:rounded-t-[19px] last:overflow-hidden last:rounded-b-[19px]";
