import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { cn } from "@/lib/cn";

interface ListRowProps {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  destructive?: boolean;
}

/** 44pt minimum row height per DESIGN.md; used for settings rows, sessions,
 * and simple list items across the app. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  showChevron = false,
  destructive = false,
}: ListRowProps): React.JSX.Element {
  const content = (
    <View className="min-h-11 flex-row items-center gap-3 px-4 py-3">
      {leading}
      <View className="flex-1">
        <Text
          className={cn(
            "font-body-semibold text-base",
            destructive ? "text-status-absent" : "text-ink dark:text-ink-dark",
          )}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-sm text-muted dark:text-muted-dark" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {showChevron ? <ChevronRight size={16} strokeWidth={1.75} color="#5E625B" /> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="active:opacity-70">
      {content}
    </Pressable>
  );
}
