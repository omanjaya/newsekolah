import { View, Text } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { Button } from "@/components/ui/Button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  return (
    <View className="flex-1 items-center justify-center gap-2 px-8 py-12">
      <Icon size={32} strokeWidth={1.75} color="#5E625B" importantForAccessibility="no" />
      <Text className="font-heading-semibold text-center text-md text-ink dark:text-ink-dark">
        {title}
      </Text>
      {description ? (
        <Text className="text-center text-sm text-muted dark:text-muted-dark">{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View className="mt-2">
          <Button label={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}
