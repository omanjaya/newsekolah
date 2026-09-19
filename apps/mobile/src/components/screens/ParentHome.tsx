import { useMemo } from "react";
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
import {
  useChildAttendance,
  useMyChildren,
  useUnreadCount,
  type LinkedChild,
} from "@/lib/api/hooks";
import { t, type MobileMessageKey } from "@/i18n/t";

function relationLabel(relation: LinkedChild["relation"]): string {
  return t(`children.relation.${relation}` as MobileMessageKey);
}

function tenantDateParts(timezone: string): { year: string; month: string; day: string } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      year: values.year ?? "",
      month: values.month ?? "",
      day: values.day ?? "",
    };
  } catch {
    const now = new Date();
    return {
      year: String(now.getFullYear()),
      month: String(now.getMonth() + 1).padStart(2, "0"),
      day: String(now.getDate()).padStart(2, "0"),
    };
  }
}

function currentMonth(timezone: string): string {
  const { year, month } = tenantDateParts(timezone);
  return `${year}-${month}`;
}

function today(timezone: string): string {
  const { year, month, day } = tenantDateParts(timezone);
  return `${year}-${month}-${day}`;
}

/** Parent home: lists every linked child as a tappable row leading to
 * /children/[studentId], above the shared announcement feed. When the
 * school has not linked any child yet, this says so plainly rather than
 * fabricating a roster (docs/10-mobile-strategy.md). */
export function ParentHome(): React.JSX.Element {
  const { me } = useAuth();
  const timezone = me?.tenant.timezone ?? "UTC";
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
          <Text className="px-4 text-md font-medium text-ink dark:text-ink-dark">
            {t("home.children")}
          </Text>
          {children.isError ? (
            <View className="gap-2 px-4" accessibilityRole="alert">
              <Text className="text-sm text-ink dark:text-ink-dark">
                {t("error.generic_action")}
              </Text>
              <Button
                label={t("offline.retry")}
                variant="secondary"
                onPress={() => void children.refetch()}
              />
            </View>
          ) : children.isLoading ? (
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
                <ChildRow key={child.student_user_id} child={child} timezone={timezone} />
              ))}
            </View>
          )}
        </View>

        <View className="gap-2 pt-4">
          <View className="flex-row items-center justify-between px-4">
            <Text className="text-md font-medium text-ink dark:text-ink-dark">
              {t("home.announcements")}
            </Text>
            <Button
              label={t("home.see_all")}
              variant="ghost"
              onPress={() => router.push("/announcements")}
            />
          </View>
          <AnnouncementsList limit={3} />
        </View>
      </ScrollView>
    </View>
  );
}

function ChildRow({
  child,
  timezone,
}: {
  child: LinkedChild;
  timezone: string;
}): React.JSX.Element {
  const month = useMemo(() => currentMonth(timezone), [timezone]);
  const attendance = useChildAttendance(child.student_user_id, month);
  const day = attendance.data?.data.find((item) => item.date === today(timezone));
  const subtitle = attendance.isLoading
    ? t("children.today_status_loading")
    : attendance.isError
      ? t("children.today_status_error")
      : day
        ? t("children.today_status")
            .replace("{status}", day.status_code)
            .replace("{submitted}", String(day.submitted_sessions))
            .replace("{expected}", String(day.expected_sessions))
        : t("children.today_status_empty");

  return (
    <View className="rounded-input border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
      <ListRow
        title={child.student_name}
        subtitle={`${child.class_name ?? relationLabel(child.relation)} · ${subtitle}`}
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
  );
}
