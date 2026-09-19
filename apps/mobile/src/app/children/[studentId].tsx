import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { CalendarCheck, FileText, GraduationCap, ShieldCheck, Star } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useChildAttendance,
  useChildDiscipline,
  useChildGrades,
  useSubjects,
} from "@/lib/api/hooks";
import { t } from "@/i18n/t";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View className="gap-2">
      <Text className="text-md font-medium text-ink dark:text-ink-dark">{title}</Text>
      {children}
    </View>
  );
}

/** Read-only view of one linked child: this month's attendance, published
 * grades, and the discipline record. Every section has its own empty state
 * so a section with nothing yet says so instead of showing a blank card
 * (docs/10-mobile-strategy.md, DESIGN.md on plain, honest empty states). */
export default function ChildDetailRoute(): React.JSX.Element {
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name?: string }>();
  const month = useMemo(() => currentMonth(), []);

  const attendance = useChildAttendance(studentId, month);
  const grades = useChildGrades(studentId);
  const discipline = useChildDiscipline(studentId);
  const subjects = useSubjects();
  const subjectMap = new Map((subjects.data?.data ?? []).map((s) => [s.id, s.name]));

  const totals = attendance.data?.totals ?? {};
  const totalAttendanceCount = Object.values(totals).reduce((sum, n) => sum + n, 0);
  const incompleteCount = (attendance.data?.data ?? []).filter((d) => !d.complete).length;

  const gradeRows = grades.data?.subjects ?? [];
  const records = discipline.data?.records ?? [];
  const letters = discipline.data?.letters ?? [];

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={name ?? t("children.fallback_title")} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}>
        <Section title={t("children.section.attendance")}>
          {attendance.isLoading ? (
            <Skeleton height={100} />
          ) : totalAttendanceCount === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title={t("children.attendance.empty")}
              description={t("children.attendance.empty_description")}
            />
          ) : (
            <View className="gap-3 rounded-input border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
              <View className="flex-row flex-wrap gap-3">
                {Object.entries(totals).map(([code, count]) => (
                  <Text key={code} className="text-sm text-ink dark:text-ink-dark">
                    {code}: {count}
                  </Text>
                ))}
              </View>
              <Text className="border-t border-line pt-2 text-sm text-ink/70 dark:border-line-dark dark:text-ink-dark/70">
                {t("children.attendance.incomplete").replace("{n}", String(incompleteCount))}
              </Text>
            </View>
          )}
        </Section>

        <Section title={t("children.section.grades")}>
          {grades.isLoading ? (
            <Skeleton height={100} />
          ) : gradeRows.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title={t("grades.empty")}
              description={t("grades.empty_description")}
            />
          ) : (
            <View className="gap-2">
              <View className="flex-row items-center justify-between rounded-input border border-line bg-surface px-4 py-3 dark:border-line-dark dark:bg-surface-dark">
                <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
                  {grades.data?.term_name}
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <Star size={16} strokeWidth={1.75} color="#1F3A5F" />
                  <Text className="text-base font-medium text-ink dark:text-ink-dark">
                    {grades.data?.stars ?? 0}
                  </Text>
                </View>
              </View>
              {gradeRows.map((subject) => (
                <View
                  key={subject.subject_id}
                  className="flex-row items-center justify-between rounded-input border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark"
                >
                  <Text className="flex-1 text-base text-ink dark:text-ink-dark">
                    {subjectMap.get(subject.subject_id) ?? "-"}
                  </Text>
                  <View className="items-end">
                    <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
                      {t("grades.average")}: {subject.average ?? "-"}
                    </Text>
                    <Text className="text-sm text-ink dark:text-ink-dark">
                      {t("grades.report_score")}: {subject.report_score ?? "-"}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Section>

        <Section title={t("children.section.discipline")}>
          {discipline.isLoading ? (
            <Skeleton height={100} />
          ) : records.length === 0 && letters.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title={t("discipline.empty")}
              description={t("discipline.empty_description")}
            />
          ) : (
            <View className="gap-3">
              <View className="flex-row items-center justify-between rounded-input border border-line bg-surface px-4 py-3 dark:border-line-dark dark:bg-surface-dark">
                <Text className="text-base text-ink dark:text-ink-dark">
                  {t("discipline.total_points")}
                </Text>
                <Text className="text-lg font-medium text-ink dark:text-ink-dark">
                  {discipline.data?.total_points ?? 0}
                </Text>
              </View>

              {letters.length > 0 ? (
                <View className="gap-2">
                  <Text className="text-sm font-medium text-ink dark:text-ink-dark">
                    {t("discipline.letters")}
                  </Text>
                  {letters.map((letter, index) => (
                    <View
                      key={`${letter.number}-${index}`}
                      className="flex-row items-center gap-3 rounded-input border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark"
                    >
                      <FileText size={20} strokeWidth={1.75} color="#1F3A5F" />
                      <View className="flex-1">
                        <Text className="text-base text-ink dark:text-ink-dark">
                          {letter.number}
                        </Text>
                        <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
                          {letter.level_label} · {letter.issued_at.slice(0, 10)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              <View className="gap-2">
                <Text className="text-sm font-medium text-ink dark:text-ink-dark">
                  {t("discipline.records")}
                </Text>
                {records.length === 0 ? (
                  <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
                    {t("discipline.records_empty")}
                  </Text>
                ) : (
                  records.map((record, index) => (
                    <View
                      key={`${record.type_name}-${record.occurred_on}-${index}`}
                      className="flex-row items-center justify-between rounded-input border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark"
                    >
                      <View className="flex-1">
                        <Text className="text-base text-ink dark:text-ink-dark">
                          {record.type_name}
                        </Text>
                        <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
                          {record.occurred_on}
                        </Text>
                      </View>
                      <Text className="text-base text-ink dark:text-ink-dark">{record.points}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}
        </Section>
      </ScrollView>
    </View>
  );
}
