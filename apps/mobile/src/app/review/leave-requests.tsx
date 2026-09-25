import { ScrollView, Text, View } from "react-native";
import { ClipboardList } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLeaveReviewQueue, useReviewLeaveRequest } from "@/lib/api/hooks";
import { t, type MobileMessageKey } from "@/i18n/t";

/** Homeroom teacher's / duty teacher's queue for planned leave requests
 * (sick, religious ceremony, dispensation, other) awaiting a first
 * approve/reject before a letter is issued. */
export default function LeaveReviewQueueRoute(): React.JSX.Element {
  const queue = useLeaveReviewQueue(undefined, true);
  const items = queue.data?.data ?? [];

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("review.leave_title")} showBack />
      {queue.isLoading ? (
        <View className="gap-2 p-4">
          <Skeleton height={96} />
          <Skeleton height={96} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t("review.leave_empty")} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {items.map((item) => (
            <LeaveRequestRow key={item.instance_id} item={item} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function LeaveRequestRow({
  item,
}: {
  item: {
    instance_id: string;
    student_name: string;
    class_name: string;
    category: string;
    reason?: string;
    starts_on: string;
    ends_on: string;
  };
}): React.JSX.Element {
  const review = useReviewLeaveRequest();

  function decide(approve: boolean) {
    // Success/error feedback comes from the mutation cache default now
    // (useReviewLeaveRequest's meta.successMessage / the translated error
    // toast) -- nothing left for this call site to add.
    review.mutate({ id: item.instance_id, approve });
  }

  return (
    <View className="gap-2 rounded-input border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <Text className="text-base text-ink dark:text-ink-dark">
        {item.student_name} · {item.class_name}
      </Text>
      <Text className="text-sm text-ink/70 dark:text-ink-dark/70">
        {t(`leave.category.${item.category}` as MobileMessageKey)} · {item.starts_on} -{" "}
        {item.ends_on}
      </Text>
      {item.reason ? (
        <Text className="text-sm text-ink/60 dark:text-ink-dark/60">{item.reason}</Text>
      ) : null}
      <View className="flex-row gap-2 pt-1">
        <Button
          label={t("review.approve")}
          loading={review.isPending}
          onPress={() => decide(true)}
        />
        <Button
          label={t("review.reject")}
          variant="secondary"
          loading={review.isPending}
          onPress={() => decide(false)}
        />
      </View>
    </View>
  );
}
