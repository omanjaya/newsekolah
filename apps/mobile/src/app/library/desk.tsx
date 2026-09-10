import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { BookOpen, Search, UserSearch } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Input } from "@/components/ui/Input";
import { ListRow } from "@/components/ui/ListRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { QuickLink } from "@/components/ui/QuickLink";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useLibraryTitles } from "@/lib/api/hooks";
import { t } from "@/i18n/t";

/**
 * Librarian's circulation hub: search the catalogue, then jump to a member
 * to borrow or return, or to the overdue list. Borrowing and returning
 * both happen on the member's own screen (app/library/member/[userId].tsx)
 * since both need a member first -- this screen only answers "what does
 * the library have".
 */
export default function LibraryDeskRoute(): React.JSX.Element {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 300);
  const titles = useLibraryTitles(debounced);
  const items = titles.data?.data ?? [];

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("library.desk_title")} showBack />
      <View className="gap-2 px-4 pt-4">
        <View className="flex-row gap-2">
          <QuickLink icon={UserSearch} label={t("library.link_member")} href="/library/lookup" />
          <QuickLink icon={BookOpen} label={t("library.link_overdue")} href="/library/overdue" />
        </View>
        <Input
          label={t("library.search_label")}
          value={search}
          onChangeText={setSearch}
          placeholder={t("library.search_placeholder")}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {titles.isLoading ? (
        <View className="gap-2 p-4">
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState icon={Search} title={t("library.search_empty")} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => (
            <ListRow
              title={item.title}
              subtitle={`${item.author} · ${t("library.available_count")
                .replace("{available}", String(item.available_copies))
                .replace("{total}", String(item.total_copies))}`}
            />
          )}
        />
      )}
      <Text className="px-4 pb-4 text-center text-xs text-ink/50 dark:text-ink-dark/50">
        {t("library.desk_hint")}
      </Text>
    </View>
  );
}
