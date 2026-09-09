import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMyCalendar, useSubjects } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { t } from "@/i18n/t";

const CODE_CLASS: Record<string, string> = {
  H: "bg-status-present/20",
  S: "bg-status-sick/20",
  I: "bg-status-excused/20",
  D: "bg-status-dispensation/20",
  A: "bg-status-absent/20",
  INCOMPLETE: "bg-status-late/20",
};
const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CalendarRoute(): React.JSX.Element {
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(
    todayIso().startsWith(month) ? todayIso() : null,
  );
  const { data, isLoading } = useMyCalendar(month);
  const subjects = useSubjects();
  const subjectMap = useMemo(
    () => new Map((subjects.data?.data ?? []).map((s) => [s.id, s.name])),
    [subjects.data],
  );
  const byDate = useMemo(() => new Map((data?.data ?? []).map((d) => [d.date, d])), [data]);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    setSelectedDate(null);
  };
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of data?.data ?? [])
      if (d.status_code !== "NONE") c[d.status_code] = (c[d.status_code] ?? 0) + 1;
    return c;
  }, [data]);
  const selectedDay = selectedDate ? byDate.get(selectedDate) : undefined;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("attendance.calendar")} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View className="flex-row items-center justify-between">
          <Button label={t("attendance.prev_month")} variant="ghost" onPress={() => shift(-1)} />
          <Text className="text-md font-medium text-ink dark:text-ink-dark">{month}</Text>
          <Button label={t("attendance.next_month")} variant="ghost" onPress={() => shift(1)} />
        </View>
        {isLoading ? (
          <Skeleton height={280} />
        ) : (
          <View className="rounded-input border border-line bg-surface p-2 dark:border-line-dark dark:bg-surface-dark">
            <View className="flex-row">
              {DAYS.map((d) => (
                <Text
                  key={d}
                  className="flex-1 py-1 text-center text-xs text-ink/60 dark:text-ink-dark/60"
                >
                  {d}
                </Text>
              ))}
            </View>
            {rows.map((row, ri) => (
              <View key={ri} className="flex-row">
                {row.map((date, ci) => {
                  const day = date ? byDate.get(date) : undefined;
                  const code = day?.status_code ?? "NONE";
                  const selected = date !== null && date === selectedDate;
                  return (
                    <Pressable
                      key={date ?? `e-${ri}-${ci}`}
                      disabled={!date}
                      accessibilityRole={date ? "button" : undefined}
                      onPress={() => date && setSelectedDate(date)}
                      className={cn(
                        "m-0.5 flex-1 items-center justify-center rounded-input border py-2",
                        selected ? "border-accent" : "border-transparent",
                        date && code !== "NONE" ? CODE_CLASS[code] : "",
                      )}
                    >
                      <Text className="text-sm text-ink dark:text-ink-dark">
                        {date ? Number(date.slice(-2)) : ""}
                      </Text>
                      {date && code !== "NONE" ? (
                        <Text className="text-[10px] font-medium text-ink dark:text-ink-dark">
                          {code}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}
        <View className="flex-row flex-wrap gap-3">
          {Object.entries(counts).map(([code, n]) => (
            <Text key={code} className="text-sm text-ink dark:text-ink-dark">
              {code}: {n}
            </Text>
          ))}
        </View>

        {selectedDate ? (
          <View className="gap-2 rounded-input border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
            <Text className="text-sm font-medium text-ink dark:text-ink-dark">{selectedDate}</Text>
            {(selectedDay?.sessions ?? []).length === 0 ? (
              <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
                {t("attendance.day_empty")}
              </Text>
            ) : (
              (selectedDay?.sessions ?? []).map((session, index) => (
                <View
                  key={`${session.schedule_id}-${index}`}
                  className="flex-row items-center justify-between border-t border-line py-2 first:border-t-0 dark:border-line-dark"
                >
                  <Text className="text-sm text-ink dark:text-ink-dark">
                    {subjectMap.get(session.subject_id) ?? "-"}
                  </Text>
                  <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
                    {session.status_code ?? t("attendance.day_pending")}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
