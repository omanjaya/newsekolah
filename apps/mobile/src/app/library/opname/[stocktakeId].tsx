import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { showToast } from "@/components/ui/Toast";
import { OfflineQueueBanner } from "@/components/screens/OfflineQueueBanner";
import { useCloseStocktake, useStocktake } from "@/lib/api/hooks";
import type { LibraryStocktakeResult } from "@/lib/api/hooks";
import { useOfflineQueueCountsFor } from "@/lib/offline/sync";
import { t } from "@/i18n/t";

const scanPathFor = (stocktakeId: string) => `/v1/library/stocktakes/${stocktakeId}/scans`;

/**
 * One stocktake (opname) session: scan barcodes one after another, offline
 * or not -- every scan writes straight to the shared offline mutation
 * queue and is picked up by the app-wide sync loop the moment the
 * connection returns (lib/offline/queue.ts, lib/offline/sync.ts). This
 * screen only ever reads that queue for a pending/conflict count, it never
 * talks to the scan endpoint directly (see features/scan/library-scan.ts).
 */
export default function LibraryStocktakeSessionRoute(): React.JSX.Element {
  const { stocktakeId } = useLocalSearchParams<{ stocktakeId: string }>();
  const session = useStocktake(stocktakeId);
  const counts = useOfflineQueueCountsFor(scanPathFor(stocktakeId));
  const close = useCloseStocktake();
  const [result, setResult] = useState<LibraryStocktakeResult | null>(null);

  const isOpen = session.data?.status === "open";
  const canClose = isOpen && counts.pending === 0;

  function closeSession() {
    close.mutate(
      { id: stocktakeId },
      {
        onSuccess: (closed) => setResult(closed),
        onError: () => showToast(t("common.error"), "error"),
      },
    );
  }

  if (session.isLoading) {
    return (
      <View className="flex-1 bg-bg dark:bg-bg-dark">
        <ScreenHeader title={t("library.opname_title")} showBack />
        <View className="gap-2 p-4">
          <Skeleton height={64} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={session.data?.name ?? t("library.opname_title")} showBack />
      <OfflineQueueBanner />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {isOpen ? (
          <>
            <Button
              label={t("library.opname_scan_button")}
              onPress={() =>
                router.push({
                  pathname: "/scan",
                  params: { mode: "library_stocktake", stocktakeId },
                })
              }
            />
            <Text className="text-sm text-ink/70 dark:text-ink-dark/70">
              {t("library.opname_pending_count").replace("{n}", String(counts.pending))}
            </Text>
            {counts.pending > 0 ? (
              <Text className="text-xs text-ink/50 dark:text-ink-dark/50">
                {t("library.opname_close_blocked")}
              </Text>
            ) : null}
            <Button
              label={t("library.opname_close_button")}
              variant="secondary"
              disabled={!canClose}
              loading={close.isPending}
              onPress={closeSession}
            />
          </>
        ) : (
          <Text className="text-sm text-ink/70 dark:text-ink-dark/70">
            {t("library.opname_closed_notice")}
          </Text>
        )}

        {result ? (
          <View className="gap-2 rounded-input border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
            <Text className="text-base font-medium text-ink dark:text-ink-dark">
              {t("library.opname_result_title")}
            </Text>
            <Text className="text-sm text-ink dark:text-ink-dark">
              {t("library.opname_result_expected").replace("{n}", String(result.expected_count))}
            </Text>
            <Text className="text-sm text-ink dark:text-ink-dark">
              {t("library.opname_result_scanned").replace("{n}", String(result.scanned_count))}
            </Text>
            <Text className="text-sm text-status-absent">
              {t("library.opname_result_missing").replace("{n}", String(result.missing.length))}
            </Text>
            <Text className="text-sm text-status-late">
              {t("library.opname_result_unexpected").replace(
                "{n}",
                String(result.unexpected.length),
              )}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
