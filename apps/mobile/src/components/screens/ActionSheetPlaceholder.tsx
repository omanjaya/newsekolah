import { Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

interface ActionSheetPlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Content for the raised center tab's sheet. Camera/QR flows are not wired
 * up yet (expo-camera and expo-notifications are installed but unused by any
 * screen), so this is an honest "coming soon", not a working scanner. */
export function ActionSheetPlaceholder({
  icon: Icon,
  title,
  description,
}: ActionSheetPlaceholderProps): React.JSX.Element {
  return (
    <View className="items-center gap-3 pb-6 pt-2">
      <Icon size={32} strokeWidth={1.75} color="#1F3A5F" />
      <Text className="text-center text-md font-medium text-ink dark:text-ink-dark">{title}</Text>
      <Text className="text-center text-sm text-ink/70 dark:text-ink-dark/70">{description}</Text>
    </View>
  );
}
