import { Text, View } from "react-native";

interface AvatarProps {
  name: string;
  size?: number;
}

const DEFAULT_COLOR = "#1F3A5F";
const PALETTE = ["#3F5F8A", "#6B4A8A", "#2F6B3A", "#8A6D1F", DEFAULT_COLOR, "#B5651D"];

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

/** Initials only. DESIGN.md: no assumed profile photos; radius 999 is
 * reserved for avatars specifically. */
export function Avatar({ name, size = 40 }: AvatarProps): React.JSX.Element {
  const backgroundColor = colorFor(name);
  return (
    <View
      style={{ width: size, height: size, borderRadius: 9999, backgroundColor }}
      className="items-center justify-center"
      accessibilityLabel={name}
    >
      <Text style={{ fontSize: size * 0.4 }} className="font-medium text-white">
        {initialsOf(name)}
      </Text>
    </View>
  );
}
