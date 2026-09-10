import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { CloudOff, TriangleAlert } from "lucide-react-native";
import { useOfflineQueueCounts } from "@/lib/offline/sync";
import { t } from "@/i18n/t";

/**
 * Visible pending-sync state for anything queued in the shared offline
 * mutation queue (src/lib/offline/queue.ts) -- attendance taken offline
 * (src/app/attendance/[sessionId].tsx) and library stocktake scans made
 * offline (src/app/library/opname/[stocktakeId].tsx) both land here. Shows
 * nothing when the queue is empty, a neutral strip while mutations are
 * only waiting for a network attempt, and a warning strip once one of them
 * comes back as a conflict that needs a person's decision
 * (src/app/offline/conflicts.tsx).
 */
export function OfflineQueueBanner(): React.JSX.Element | null {
  const { pending, conflicted } = useOfflineQueueCounts();

  if (conflicted > 0) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/offline/conflicts")}
        className="mx-4 mt-3 flex-row items-center gap-2 rounded-input border border-status-late bg-status-late/10 px-3 py-2"
      >
        <TriangleAlert size={18} strokeWidth={1.75} color="#B5651D" />
        <Text className="flex-1 text-sm text-ink dark:text-ink-dark">
          {t("offline.banner_conflict").replace("{n}", String(conflicted))}
        </Text>
      </Pressable>
    );
  }

  if (pending > 0) {
    return (
      <View className="mx-4 mt-3 flex-row items-center gap-2 rounded-input border border-line bg-surface px-3 py-2 dark:border-line-dark dark:bg-surface-dark">
        <CloudOff size={18} strokeWidth={1.75} color="#8A8A8A" />
        <Text className="flex-1 text-sm text-ink/70 dark:text-ink-dark/70">
          {t("offline.banner_pending").replace("{n}", String(pending))}
        </Text>
      </View>
    );
  }

  return null;
}
