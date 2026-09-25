import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ClockAlert } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLateArrivalReviewQueue, useReviewLateArrival } from "@/lib/api/hooks";
import { t } from "@/i18n/t";

/**
 * Duty teacher's (guru piket) queue: every open late arrival waiting for a
 * first review before the flow moves on to leadership. The API's queue
 * summary carries no student name (unlike the leave-request queue), so this
 * identifies each row by occurrence and time -- a known gap in
 * AttendanceLateArrivalSummary, not something this screen can paper over.
 */
export default function LateArrivalQueueRoute(): React.JSX.Element {
  const queue = useLateArrivalReviewQueue(true);
  const items = queue.data?.data ?? [];

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("review.late_title")} showBack />
      {queue.isLoading ? (
        <View className="gap-2 p-4">
          <Skeleton height={96} />
          <Skeleton height={96} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState icon={ClockAlert} title={t("review.late_empty")} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {items.map((item) => (
            <LateArrivalRow
              key={item.instance_id}
              instanceId={item.instance_id}
              reason={item.reason}
              occurrenceNumber={item.occurrence_number}
              openedAt={item.opened_at}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function LateArrivalRow({
  instanceId,
  reason,
  occurrenceNumber,
  openedAt,
}: {
  instanceId: string;
  reason: string;
  occurrenceNumber: number;
  openedAt: string;
}): React.JSX.Element {
  const review = useReviewLateArrival();
  const [homeroomReported, setHomeroomReported] = useState(false);

  function submit() {
    // Success/error feedback comes from the mutation cache default now
    // (useReviewLateArrival's meta.successMessage / the translated error
    // toast) -- nothing left for this call site to add.
    review.mutate({ id: instanceId, homeroomReported });
  }

  return (
    <View className="gap-2 rounded-input border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <Text className="text-base text-ink dark:text-ink-dark">
        {t("late.occurrence").replace("{n}", String(occurrenceNumber))}
      </Text>
      <Text className="text-sm text-ink/70 dark:text-ink-dark/70">{reason}</Text>
      <Text className="text-xs text-ink/50 dark:text-ink-dark/50">
        {openedAt.slice(0, 16).replace("T", " ")}
      </Text>
      <View className="flex-row items-center justify-between pt-1">
        <Text className="text-sm text-ink dark:text-ink-dark">{t("review.homeroom_reported")}</Text>
        <Button
          label={homeroomReported ? t("common.yes") : t("common.no")}
          variant={homeroomReported ? "primary" : "secondary"}
          onPress={() => setHomeroomReported((v) => !v)}
        />
      </View>
      <Button label={t("review.submit")} fullWidth loading={review.isPending} onPress={submit} />
    </View>
  );
}
