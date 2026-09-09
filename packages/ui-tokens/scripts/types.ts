export interface StatusColor {
  indicator: string;
  fg: string;
}

export type StatusName = "present" | "sick" | "excused" | "dispensation" | "absent" | "late";

export interface ThemeColors {
  bg: string;
  surface: string;
  fg: string;
  fgMuted: string;
  border: string;
  accent: string;
  accentFg: string;
  status: Record<StatusName, StatusColor>;
}

export interface TokensSource {
  color: {
    light: ThemeColors;
    dark: ThemeColors;
  };
  statusNames: Record<StatusName, string>;
  spacing: Record<string, number>;
  radius: Record<string, number>;
  type: Record<string, number>;
  shadow: Record<string, string>;
  zIndex: Record<string, number>;
  motion: {
    duration: Record<string, number>;
    easing: string;
  };
}
