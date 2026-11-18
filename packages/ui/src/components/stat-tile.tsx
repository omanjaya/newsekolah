"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactElement } from "react";

import { Stat, type StatProps } from "./stat.js";
import type { CategoryTone } from "./tone.js";

export type StatTileTone = CategoryTone;

export interface StatTileProps extends Omit<StatProps, "icon" | "category" | "appearance"> {
  icon: LucideIcon;
  tone: StatTileTone;
}

/**
 * The home-screen tile: `Stat` with the `tile` appearance, taking a Lucide
 * component instead of an icon element. Kept as its own name for the call
 * sites that already use it; new code can use
 * `<Stat appearance="tile" icon={<Icon />} tone="green" />` directly.
 */
export function StatTile({ icon: Icon, ...props }: StatTileProps): ReactElement {
  return <Stat {...props} appearance="tile" icon={<Icon />} />;
}
