import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";
import { CloudAlert } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { showToast } from "@/components/ui/Toast";
import { getOfflineQueue, type QueuedMutation } from "@/lib/offline/queue";
import { t } from "@/i18n/t";

const SESSION_ENTRIES_PATH = /^\/v1\/attendance\/sessions\/([^/]+)\/entries$/;
const STOCKTAKE_SCAN_PATH = /^\/v1\/library\/stocktakes\/([^/]+)\/scans$/;

/**
 * Every mutation the shared offline queue (lib/offline/queue.ts) parked as
 * a conflict instead of retrying forever: an attendance save the server
 * rejected with 409 because someone else already submitted that session,
 * or a library stocktake scan rejected with 404 because its barcode
 * matches no copy (a mis-scan, a damaged label, or a book never
 * catalogued). Both need a person's decision, not another automatic
 * retry -- reopen the session to redo it as a correction, retry once the
 * underlying problem is fixed (the copy gets added to the catalogue), or
 * discard the local attempt.
 */
export default function OfflineConflictsRoute(): React.JSX.Element {
  const [items, setItems] = useState<QueuedMutation[] | null>(null);

  const reload = useCallback(() => {
    void getOfflineQueue().conflicts().then(setItems);
  }, []);

  useEffect(reload, [reload]);
  useFocusEffect(reload);

  async function discard(id: string): Promise<void> {
    await getOfflineQueue().resolveConflict(id, "discard");
    showToast(t("offline.discarded"), "default");
    reload();
  }

  async function retry(id: string): Promise<void> {
    await getOfflineQueue().resolveConflict(id, "retry");
    showToast(t("offline.retried"), "default");
    reload();
  }

  function openSession(path: string): void {
    const match = SESSION_ENTRIES_PATH.exec(path);
    if (!match) return;
    router.push({ pathname: "/attendance/[sessionId]", params: { sessionId: match[1] } });
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("offline.conflicts_title")} showBack />
      {items === null ? null : items.length === 0 ? (
        <EmptyState
          icon={CloudAlert}
          title={t("offline.conflicts_empty")}
          description={t("offline.conflicts_empty_description")}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {items.map((item) => {
            const isSession = SESSION_ENTRIES_PATH.test(item.path);
            const stocktakeScan = STOCKTAKE_SCAN_PATH.exec(item.path);
            const barcode = stocktakeScan ? (item.body as { barcode?: string }).barcode : undefined;
            const label = isSession
              ? t("offline.conflict_attendance")
              : stocktakeScan
                ? t("offline.conflict_stocktake_scan").replace("{barcode}", barcode ?? "-")
                : item.path;
            return (
              <View
                key={item.id}
                className="gap-2 rounded-input border border-status-late bg-status-late/5 p-4"
              >
                <Text className="text-base text-ink dark:text-ink-dark">{label}</Text>
                <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
                  {item.lastError ?? t("offline.conflict_unknown")}
                </Text>
                <View className="flex-row flex-wrap gap-2 pt-1">
                  {isSession ? (
                    <Button
                      label={t("offline.open_session")}
                      variant="secondary"
                      onPress={() => openSession(item.path)}
                    />
                  ) : null}
                  {stocktakeScan ? (
                    <Button
                      label={t("offline.retry")}
                      variant="secondary"
                      onPress={() => void retry(item.id)}
                    />
                  ) : null}
                  <Button
                    label={t("offline.discard")}
                    variant="ghost"
                    onPress={() => void discard(item.id)}
                  />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
