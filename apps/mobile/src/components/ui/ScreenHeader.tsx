import { Pressable, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  right?: React.ReactNode;
}

/** Page title 24 medium per DESIGN.md. Back target always the previous
 * screen -- no route aliasing (docs/07-ui-ux.md section 8). */
export function ScreenHeader({
  title,
  showBack = false,
  right,
}: ScreenHeaderProps): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row items-center justify-between border-b border-line bg-bg px-4 pb-3 dark:border-line-dark dark:bg-bg-dark"
      style={{ paddingTop: insets.top + 12 }}
    >
      <View className="min-h-11 flex-1 flex-row items-center gap-2">
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kembali"
            hitSlop={8}
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center"
          >
            <ChevronLeft size={20} strokeWidth={1.75} color="#333333" />
          </Pressable>
        ) : null}
        <Text className="text-xl font-medium text-ink dark:text-ink-dark" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right ? <View className="min-h-11 flex-row items-center">{right}</View> : null}
    </View>
  );
}
