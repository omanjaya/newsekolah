import { Text, View } from "react-native";
import { useThemeColors } from "@/theme";

interface AvatarProps {
  name: string;
  size?: number;
  /** "auto" (default) hashes the name to one of a few colors, useful for
   * telling people apart in a roster. "accent" always uses the theme's soft
   * accent circle -- the current user's own avatar in HomeHeader
   * (docs/design-reference-hijau-segar.html), which stays green regardless
   * of whose name it is. */
  variant?: "auto" | "accent";
}

const DEFAULT_COLOR = "#0F7A5F";
const PALETTE = ["#3F5F8A", "#6B4A8A", "#2F6B3A", "#A15C00", DEFAULT_COLOR, "#7A3E9D"];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length] ?? DEFAULT_COLOR;
}

/** Initials only -- no assumed profile photos; radius 999 (pill) is
 * reserved for avatars specifically. */
export function Avatar({ name, size = 40, variant = "auto" }: AvatarProps): React.JSX.Element {
  const colors = useThemeColors();
  const backgroundColor = variant === "accent" ? colors.accentSoft : colorFor(name);
  const textColor = variant === "accent" ? colors.accentText : "#FFFFFF";
  return (
    <View
      style={{ width: size, height: size, borderRadius: 9999, backgroundColor }}
      className="items-center justify-center"
      accessibilityLabel={name}
    >
      <Text style={{ fontSize: size * 0.36, color: textColor, fontFamily: "Manrope_700Bold" }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}
