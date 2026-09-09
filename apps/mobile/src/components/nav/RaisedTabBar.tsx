import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import type { LucideIcon } from "lucide-react-native";
import { cn } from "@/lib/cn";

interface CenterAction {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}

interface RaisedTabBarProps extends BottomTabBarProps {
  icons: Record<string, LucideIcon>;
  labels: Record<string, string>;
  centerAction?: CenterAction;
}

const ACCENT = "#1F3A5F";
const INACTIVE = "#8A8A8A";

/**
 * Standard bottom tabs plus an optional raised center button (docs/07-ui-ux.md:
 * "aksi scan besar di mobile"). The center button is not a route: it opens a
 * sheet from the screen that renders this tab bar, so tapping it never
 * changes `state.index`.
 */
export function RaisedTabBar({
  state,
  navigation,
  icons,
  labels,
  centerAction,
}: RaisedTabBarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingBottom: insets.bottom }}
      className="border-t border-line bg-surface dark:border-line-dark dark:bg-surface-dark"
    >
      <View className="flex-row items-stretch">
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const Icon = icons[route.name];
          const label = labels[route.name] ?? route.name;
          const isCenterSlot =
            centerAction !== undefined && index === Math.floor(state.routes.length / 2);

          const tabButton = (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={label}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              className="min-h-11 flex-1 items-center justify-center gap-0.5 py-2"
            >
              {Icon ? (
                <Icon size={20} strokeWidth={1.75} color={isFocused ? ACCENT : INACTIVE} />
              ) : null}
              <Text
                className={cn(
                  "text-xs",
                  isFocused ? "font-medium text-accent" : "text-ink/60 dark:text-ink-dark/60",
                )}
              >
                {label}
              </Text>
            </Pressable>
          );

          if (!isCenterSlot) return tabButton;

          return (
            <View key={`slot-${route.key}`} className="flex-1 flex-row">
              <CenterButton action={centerAction} />
              {tabButton}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CenterButton({ action }: { action: CenterAction }): React.JSX.Element {
  const Icon = action.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={action.onPress}
      style={{
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      }}
      className="absolute -top-6 left-1/2 h-14 w-14 -ml-7 items-center justify-center rounded-full bg-accent"
    >
      <Icon size={24} strokeWidth={1.75} color="#FFFFFF" />
    </Pressable>
  );
}
