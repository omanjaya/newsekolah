import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { AnnouncementsList } from "@/components/screens/AnnouncementsList";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUnreadCount } from "@/lib/api/hooks";
import { t } from "@/i18n/t";

/** Parent home: no parent-child link endpoint exists yet, so this shows the
 * parent's own identity and notifications plus the shared announcement
 * feed, and says plainly that per-child data is still to come -- it never
 * fabricates a child roster (docs/10-mobile-strategy.md). */
export function ParentHome(): React.JSX.Element {
  const { me } = useAuth();
  const unread = useUnreadCount();

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("home.title")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
        <View className="px-4 pt-4">
          <Text className="text-md font-medium text-ink dark:text-ink-dark">{me?.name}</Text>
          <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
            {me?.active_academic_year?.label ?? ""}
            {(unread.data?.count ?? 0) > 0 ? ` · ${unread.data?.count} ${t("home.unread")}` : ""}
          </Text>
        </View>

        <View className="gap-2 px-4 pt-4">
          <View className="rounded-input border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark">
            <Text className="text-sm text-ink/80 dark:text-ink-dark/80">{t("home.parent_pending_link")}</Text>
          </View>
        </View>

        <View className="gap-2 pt-4">
          <View className="flex-row items-center justify-between px-4">
            <Text className="text-md font-medium text-ink dark:text-ink-dark">{t("home.announcements")}</Text>
            <Button label={t("home.see_all")} variant="ghost" onPress={() => router.push("/announcements")} />
          </View>
          <AnnouncementsList limit={3} />
        </View>
      </ScrollView>
    </View>
  );
}
