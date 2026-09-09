import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Bell } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "@/lib/api/hooks";
import { t } from "@/i18n/t";
import { cn } from "@/lib/cn";

export function NotificationsScreen(): React.JSX.Element {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading, refetch, isRefetching } = useNotifications(unreadOnly);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const items = data?.data ?? [];
  const hasUnread = items.some((n) => !n.read_at);

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader
        title={t("notifications.title")}
        right={
          <Button
            label={t("notifications.mark_all")}
            variant="ghost"
            disabled={!hasUnread}
            loading={markAll.isPending}
            onPress={() => markAll.mutate()}
          />
        }
      />
      <View className="flex-row gap-2 px-4 py-2">
        <Button label={t("notifications.title")} variant={unreadOnly ? "secondary" : "primary"} onPress={() => setUnreadOnly(false)} />
        <Button label={t("notifications.unread_only")} variant={unreadOnly ? "primary" : "secondary"} onPress={() => setUnreadOnly(true)} />
      </View>
      {isLoading ? (
        <View className="gap-2 px-4">
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title={t("notifications.empty")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          renderItem={({ item }) => {
            const unread = !item.read_at;
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (unread) markRead.mutate(item.id);
                }}
                className={cn(
                  "flex-row gap-3 border-b border-line px-4 py-3 dark:border-line-dark",
                  unread && "bg-accent/5",
                )}
              >
                <View className={cn("mt-2 h-2 w-2 rounded-full", unread ? "bg-accent" : "bg-transparent")} />
                <View className="flex-1">
                  <Text className={cn("text-base text-ink dark:text-ink-dark", unread && "font-medium")}>{item.title}</Text>
                  <Text className="text-sm text-ink/70 dark:text-ink-dark/70">{item.body}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
