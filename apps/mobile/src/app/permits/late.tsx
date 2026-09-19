import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { ClockAlert } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WorkflowSteps } from "@/components/screens/WorkflowSteps";
import { useCurrentLateArrival } from "@/lib/api/hooks";
import { t } from "@/i18n/t";

export default function LateArrivalRoute(): React.JSX.Element {
  const current = useCurrentLateArrival(true);
  const detail = current.data;
  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("late.title")} showBack />
      {current.isLoading ? (
        <View className="p-4">
          <Skeleton height={160} />
        </View>
      ) : !detail ? (
        <EmptyState
          icon={ClockAlert}
          title={t("late.none")}
          description={t("late.none_hint")}
          actionLabel={t("scan.title")}
          onAction={() => router.push("/scan")}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Text className="text-base text-ink dark:text-ink-dark">
            {t("late.occurrence").replace("{n}", String(detail.occurrence_number))}
          </Text>
          {detail.reason ? (
            <Text className="text-sm text-ink/70 dark:text-ink-dark/70">
              {t("late.reason")}: {detail.reason}
            </Text>
          ) : null}
          <WorkflowSteps instance={detail.instance} />
          {detail.instance.status === "in_progress" && detail.instance.current_stage ? (
            detail.instance.current_stage.verification === "qr_scan" ? (
              <Button
                label={t("late.scan_stage").replace("{stage}", detail.instance.current_stage.label)}
                fullWidth
                onPress={() => router.push("/scan")}
              />
            ) : (
              <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
                {t("late.wait").replace("{stage}", detail.instance.current_stage.label)}
              </Text>
            )
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
