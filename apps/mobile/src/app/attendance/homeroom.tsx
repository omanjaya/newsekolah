import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Users } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHomeroomAttendance } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { t } from "@/i18n/t";

const STATUS_DOT: Record<string, string> = {
  H: "bg-status-present",
  S: "bg-status-sick",
  I: "bg-status-excused",
  D: "bg-status-dispensation",
  A: "bg-status-absent",
  INCOMPLETE: "bg-status-late",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Homeroom teacher's (wali kelas) read-only view of one day's status for
 * every student in their own homeroom class -- the class is resolved
 * server-side from the caller's identity (docs/07-ui-ux.md), so this screen
 * takes only a date. */
export default function HomeroomAttendanceRoute(): React.JSX.Element {
  const [date, setDate] = useState(today());
  const { data, isLoading } = useHomeroomAttendance(date);
  const roster = data?.data ?? [];

  function shiftDay(delta: number): void {
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + delta);
    setDate(next.toISOString().slice(0, 10));
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("homeroom.title")} showBack />
      <View className="flex-row items-center justify-between px-4 pt-3">
        <Button label={t("attendance.prev_month")} variant="ghost" onPress={() => shiftDay(-1)} />
        <Text className="text-md font-medium text-ink dark:text-ink-dark">{date}</Text>
        <Button label={t("attendance.next_month")} variant="ghost" onPress={() => shiftDay(1)} />
      </View>
      {isLoading ? (
        <View className="gap-2 p-4">
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      ) : roster.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("homeroom.empty")}
          description={t("homeroom.empty_description")}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {roster.map((entry) => (
            <View
              key={entry.student_user_id}
              className="flex-row items-center gap-3 rounded-input border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark"
            >
              <View
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  STATUS_DOT[entry.status_code] ?? "bg-ink/20",
                )}
              />
              <Text className="flex-1 text-base text-ink dark:text-ink-dark">{entry.name}</Text>
              <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
                {entry.submitted_sessions}/{entry.expected_sessions}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
