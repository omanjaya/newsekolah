import { FlatList, View } from "react-native";
import { router } from "expo-router";
import { ClockAlert } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ListRow } from "@/components/ui/ListRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLibraryTitle, useOverdueLoans } from "@/lib/api/hooks";
import type { LibraryLoan } from "@/lib/api/hooks";
import { t } from "@/i18n/t";

function daysLate(dueOn: string): number {
  const diff = Date.now() - new Date(dueOn).getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

/**
 * Every active loan past its due date, oldest problem first. The API has
 * no member-search endpoint the librarian role can call (see
 * app/library/lookup.tsx), so a row can only show the member's raw user id
 * -- the same gap AttendanceLateArrivalSummary has for student names in
 * app/review/late-arrivals.tsx, not something this screen can paper over.
 */
export default function LibraryOverdueRoute(): React.JSX.Element {
  const overdue = useOverdueLoans(true);
  const items = overdue.data?.data ?? [];

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("library.overdue_title")} showBack />
      {overdue.isLoading ? (
        <View className="gap-2 p-4">
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState icon={ClockAlert} title={t("library.overdue_empty")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => <OverdueRow loan={item} />}
        />
      )}
    </View>
  );
}

function OverdueRow({ loan }: { loan: LibraryLoan }): React.JSX.Element {
  const title = useLibraryTitle(loan.title_id);
  return (
    <ListRow
      title={title.data?.title ?? t("library.loading_title")}
      subtitle={t("library.overdue_row")
        .replace("{days}", String(daysLate(loan.due_on)))
        .replace("{member}", loan.member_user_id.slice(0, 8))}
      showChevron
      onPress={() => router.push(`/library/member/${loan.member_user_id}`)}
    />
  );
}
