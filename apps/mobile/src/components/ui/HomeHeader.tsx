import { Pressable, Text, View } from "react-native";
import { Bell } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/ui/Avatar";
import { useThemeColors } from "@/theme";

interface HomeHeaderProps {
  /** "SMA Contoh - Kamis, 25 Sep" */
  eyebrow: string;
  /** First name only, per the reference mockup ("Halo, Nadia"). */
  greetingName: string;
  unreadCount: number;
  onPressNotifications: () => void;
  onPressProfile: () => void;
  profileName: string;
}

/** Home screen header shared by every role once signed in: school + date,
 * a big Manrope greeting, a notification bell, and an avatar shortcut to
 * the profile tab (docs/design-reference-hijau-segar.html). */
export function HomeHeader({
  eyebrow,
  greetingName,
  unreadCount,
  onPressNotifications,
  onPressProfile,
  profileName,
}: HomeHeaderProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  return (
    <View
      className="flex-row items-center justify-between px-5 pb-0"
      style={{ paddingTop: insets.top + 16 }}
    >
      <View className="gap-1">
        <Text className="text-sm text-muted dark:text-muted-dark">{eyebrow}</Text>
        <Text
          className="text-ink dark:text-ink-dark"
          style={{ fontFamily: "Manrope_700Bold", fontSize: 28, letterSpacing: -0.4 }}
        >
          {greetingName}
        </Text>
      </View>
      <View className="flex-row items-center gap-2.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifikasi"
          hitSlop={8}
          onPress={onPressNotifications}
          className="h-11 w-11 items-center justify-center rounded-chip border border-hairline bg-surface dark:border-hairline-dark dark:bg-surface-dark"
        >
          <Bell size={20} strokeWidth={2} color={colors.text} />
          {unreadCount > 0 ? (
            <View
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent"
              accessibilityLabel={`${String(unreadCount)} notifikasi belum dibaca`}
            />
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Profil" onPress={onPressProfile}>
          <Avatar name={profileName} size={44} variant="accent" />
        </Pressable>
      </View>
    </View>
  );
}
