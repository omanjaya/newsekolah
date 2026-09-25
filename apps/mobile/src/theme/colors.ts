import { useColorScheme } from "react-native";
import tokens from "./tokens.json";

export type ColorScheme = "light" | "dark";
export type ChipColor = "green" | "amber" | "purple" | "blue";

export interface ChipPair {
  fg: string;
  bg: string;
}

export interface ThemeColors {
  bg: string;
  card: string;
  cardBorder: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
  /** Accent used as *text or icon color* sitting directly on `bg`/`card`
   * (not inside a solid accent fill) -- brighter than `accent` in dark mode
   * so it still clears 4.5:1 against the dark background. */
  accentText: string;
  accentFg: string;
  accentSoft: string;
  chips: Record<ChipColor, ChipPair>;
}

const palette = tokens.color as Record<ColorScheme, ThemeColors>;

export function themeColors(scheme: ColorScheme): ThemeColors {
  return palette[scheme];
}

/** Active theme palette for the device's current appearance. */
export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return themeColors(scheme);
}

export const radius = tokens.radius;
