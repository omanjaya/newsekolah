import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Users } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import { ListRow } from "@/components/ui/ListRow";
import { AnnouncementsList } from "@/components/screens/AnnouncementsList";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useMyChildren, useUnreadCount, type LinkedChild } from "@/lib/api/hooks";
import { t, type MobileMessageKey } from "@/i18n/t";

function relationLabel(relation: LinkedChild["relation"]): string {
  return t(`children.relation.${relation}` as MobileMessageKey);
}

/** Parent home: lists every linked child as a tappable row leading to
 * /children/[studentId], above the shared announcement feed. When the
 * school has not linked any child yet, this says so plainly rather than
 * fabricating a roster (docs/10-mobile-strategy.md). */
export function ParentHome(): React.JSX.Element {
  const { me } = useAuth();
  const unread = useUnreadCount();
  const children = useMyChildren();
  const rows = children.data?.data ?? [];

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

        <View className="gap-2 pt-4">
          <Text className="px-4 text-md font-medium text-ink dark:text-ink-dark">{t("home.children")}</Text>
          {children.isLoading ? (
            <View className="gap-2 px-4">
              <Skeleton height={56} />
              <Skeleton height={56} />
            </View>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t("children.no_children_title")}
              description={t("children.no_children_description")}
            />
          ) : (
            <View className="gap-2 px-4">
              {rows.map((child) => (
                <View
                  key={child.student_user_id}
                  className="rounded-input border border-line bg-surface dark:border-line-dark dark:bg-surface-dark"
                >
                  <ListRow
                    title={child.student_name}
                    subtitle={child.class_name ?? relationLabel(child.relation)}
                    leading={<Avatar name={child.student_name} size={36} />}
                    showChevron
                    onPress={() =>
                      router.push({
                        pathname: "/children/[studentId]",
                        params: { studentId: child.student_user_id, name: child.student_name },
                      })
                    }
                  />
                </View>
              ))}
            </View>
          )}
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
