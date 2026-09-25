import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { useThemeColors } from "@/theme";

interface QuickLinkProps {
  icon: LucideIcon;
  label: string;
  href: string;
}

/** One tile in a row of role shortcuts (home screen, library desk, ...):
 * icon in a soft accent circle over a short label, min 44pt tall. */
export function QuickLink({ icon: Icon, label, href }: QuickLinkProps): React.JSX.Element {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      className="min-w-[92px] flex-1 items-center gap-2 rounded-card border border-hairline bg-surface px-2 py-3.5 dark:border-hairline-dark dark:bg-surface-dark"
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-chip"
        style={{ backgroundColor: colors.accentSoft }}
      >
        <Icon size={18} strokeWidth={2} color={colors.accentText} />
      </View>
      <Text
        className="text-center text-xs text-ink dark:text-ink-dark"
        style={{ fontFamily: "PlusJakartaSans_600SemiBold" }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}
