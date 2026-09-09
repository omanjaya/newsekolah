import { ScrollView, Text, View } from "react-native";
import { FileText, ShieldCheck } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMyDiscipline } from "@/lib/api/hooks";
import { t } from "@/i18n/t";

export default function DisciplineRoute(): React.JSX.Element {
  const { data, isLoading } = useMyDiscipline();
  const records = data?.records.filter((r) => !r.is_voided) ?? [];
  const letters = data?.letters ?? [];

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("discipline.title")} showBack />
      {isLoading || !data ? (
        <View className="gap-2 p-4">
          <Skeleton height={64} />
          <Skeleton height={100} />
        </View>
      ) : records.length === 0 && letters.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("discipline.empty")} description={t("discipline.empty_description")} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
          <View className="flex-row items-center justify-between rounded-input border border-line bg-surface px-4 py-3 dark:border-line-dark dark:bg-surface-dark">
            <Text className="text-base text-ink dark:text-ink-dark">{t("discipline.total_points")}</Text>
            <Text className="text-lg font-medium text-ink dark:text-ink-dark">{data.total_points}</Text>
          </View>

          {letters.length > 0 ? (
            <View className="gap-2">
              <Text className="text-md font-medium text-ink dark:text-ink-dark">{t("discipline.letters")}</Text>
              {letters.map((letter) => (
                <View
                  key={letter.id}
                  className="flex-row items-center gap-3 rounded-input border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark"
                >
                  <FileText size={20} strokeWidth={1.75} color="#1F3A5F" />
                  <View className="flex-1">
                    <Text className="text-base text-ink dark:text-ink-dark">{letter.letter_number}</Text>
                    <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
                      {letter.level_label} · {letter.issued_at.slice(0, 10)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <View className="gap-2">
            <Text className="text-md font-medium text-ink dark:text-ink-dark">{t("discipline.records")}</Text>
            {records.length === 0 ? (
              <Text className="text-sm text-ink/60 dark:text-ink-dark/60">{t("discipline.records_empty")}</Text>
            ) : (
              records.map((record) => (
                <View
                  key={record.id}
                  className="flex-row items-center justify-between rounded-input border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark"
                >
                  <View className="flex-1">
                    <Text className="text-base text-ink dark:text-ink-dark">{record.type_name}</Text>
                    <Text className="text-sm text-ink/60 dark:text-ink-dark/60">{record.occurred_on}</Text>
                  </View>
                  <Text className="text-base text-ink dark:text-ink-dark">{record.points}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
