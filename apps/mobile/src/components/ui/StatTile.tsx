import { Pressable, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { useThemeColors, type ChipColor } from "@/theme";

interface StatTileProps {
  icon: LucideIcon;
  /** The big Manrope number (or short value like "2 buku") -- a string so
   * callers can include a unit without this component guessing one. */
  value: string;
  label: string;
  color: ChipColor;
  onPress?: () => void;
  testID?: string;
}

/** One tile of the home screen's 2x2 stat grid (docs/design-reference-hijau-segar.html):
 * icon in a soft circle, a big Manrope number, a muted label underneath.
 * Callers decide whether the tile renders at all -- this component never
 * invents a value, it only lays one out. Navigation is an injected
 * `onPress`, not an internal router call, so this stays a plain
 * presentational component (see StudentHomeView, which is unit-tested
 * without expo-router in its import graph as a result). */
export function StatTile({
  icon: Icon,
  value,
  label,
  color,
  onPress,
  testID,
}: StatTileProps): React.JSX.Element {
  const colors = useThemeColors();
  const chip = colors.chips[color];

  const content = (
    <Card className="min-h-[104px] flex-1 gap-3.5 p-4" testID={testID}>
      <View
        className="h-[38px] w-[38px] items-center justify-center rounded-chip"
        style={{ backgroundColor: chip.bg }}
      >
        <Icon size={20} strokeWidth={2} color={chip.fg} />
      </View>
      <View className="gap-0.5">
        <Text
          className="text-[22px] leading-[26px] text-ink dark:text-ink-dark"
          style={{ fontFamily: "Manrope_700Bold", letterSpacing: -0.2 }}
          numberOfLines={1}
        >
          {value}
        </Text>
        <Text className="text-sm text-muted dark:text-muted-dark" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Card>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-1 active:opacity-80"
      testID={testID ? `${testID}-pressable` : undefined}
    >
      {content}
    </Pressable>
  );
}
