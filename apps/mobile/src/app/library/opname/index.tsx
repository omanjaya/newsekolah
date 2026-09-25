import { useState } from "react";
import { FlatList, View } from "react-native";
import { router } from "expo-router";
import { ClipboardCheck } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ListRow } from "@/components/ui/ListRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLibraryStocktakes, useStartStocktake } from "@/lib/api/hooks";
import { t } from "@/i18n/t";

/** Stocktake (opname) sessions: past and present. Starting one only needs
 * a name -- the actual walk-the-shelves scanning happens on its own screen
 * (app/library/opname/[stocktakeId].tsx), offline-first. */
export default function LibraryOpnameListRoute(): React.JSX.Element {
  const [name, setName] = useState("");
  const stocktakes = useLibraryStocktakes();
  const start = useStartStocktake();
  const items = stocktakes.data?.data ?? [];

  function startSession() {
    const trimmed = name.trim();
    if (!trimmed) return;
    start.mutate(
      { name: trimmed },
      {
        onSuccess: (created) => {
          setName("");
          router.push(`/library/opname/${created.id}`);
        },
      },
    );
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("library.opname_title")} showBack />
      <View className="gap-2 px-4 pt-4">
        <Input
          label={t("library.opname_name_label")}
          value={name}
          onChangeText={setName}
          placeholder={t("library.opname_name_placeholder")}
        />
        <Button
          label={t("library.opname_start")}
          disabled={!name.trim()}
          loading={start.isPending}
          onPress={startSession}
        />
      </View>
      {stocktakes.isLoading ? (
        <View className="gap-2 p-4">
          <Skeleton height={64} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={t("library.opname_empty")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={
                item.status === "open"
                  ? t("library.opname_status_open")
                  : t("library.opname_status_closed")
              }
              showChevron
              onPress={() => router.push(`/library/opname/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  );
}
