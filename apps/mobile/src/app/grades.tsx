import { ScrollView, Text, View } from "react-native";
import { GraduationCap, Star } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMyGrades, useSubjects } from "@/lib/api/hooks";
import { t, type MobileMessageKey } from "@/i18n/t";

export default function GradesRoute(): React.JSX.Element {
  const grades = useMyGrades();
  const subjects = useSubjects();
  const subjectMap = new Map((subjects.data?.data ?? []).map((s) => [s.id, s.name]));
  const data = grades.data;
  const rows = data?.subjects ?? [];

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("grades.title")} showBack />
      {grades.isLoading ? (
        <View className="gap-2 p-4">
          <Skeleton height={64} />
          <Skeleton height={120} />
          <Skeleton height={120} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState icon={GraduationCap} title={t("grades.empty")} description={t("grades.empty_description")} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}>
          <View className="flex-row items-center justify-between rounded-input border border-line bg-surface px-4 py-3 dark:border-line-dark dark:bg-surface-dark">
            <View>
              <Text className="text-sm text-ink/60 dark:text-ink-dark/60">{data?.term_name}</Text>
              <Text className="text-base text-ink dark:text-ink-dark">{t("grades.stars")}</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <Star size={18} strokeWidth={1.75} color="#1F3A5F" />
              <Text className="text-md font-medium text-ink dark:text-ink-dark">{data?.stars ?? 0}</Text>
            </View>
          </View>

          {rows.map((subject) => (
            <View
              key={subject.subject_id}
              className="gap-2 rounded-input border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark"
            >
              <Text className="text-base font-medium text-ink dark:text-ink-dark">
                {subjectMap.get(subject.subject_id) ?? "-"}
              </Text>
              {subject.components.length === 0 ? (
                <Text className="text-sm text-ink/60 dark:text-ink-dark/60">{t("grades.no_components")}</Text>
              ) : (
                <View className="gap-1">
                  {subject.components.map((c) => (
                    <View key={c.code} className="flex-row items-center justify-between">
                      <Text className="text-sm text-ink/80 dark:text-ink-dark/80">
                        {c.code} · {t(`grades.component.${c.kind}` as MobileMessageKey)}
                      </Text>
                      <Text className="text-sm text-ink dark:text-ink-dark">{c.score}</Text>
                    </View>
                  ))}
                </View>
              )}
              <View className="flex-row items-center justify-between border-t border-line pt-2 dark:border-line-dark">
                <Text className="text-sm text-ink/60 dark:text-ink-dark/60">{t("grades.average")}</Text>
                <Text className="text-sm text-ink dark:text-ink-dark">{subject.average ?? "-"}</Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-ink/60 dark:text-ink-dark/60">{t("grades.report_score")}</Text>
                <Text className="text-base font-medium text-ink dark:text-ink-dark">{subject.report_score ?? "-"}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
