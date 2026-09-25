import { ScrollView, Text, View } from "react-native";
import { BookOpen, CalendarCheck, ClipboardList, Star, type LucideIcon } from "lucide-react-native";
import { HomeHeader } from "@/components/ui/HomeHeader";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { Skeleton } from "@/components/ui/Skeleton";
import { AnnouncementsList } from "@/components/screens/AnnouncementsList";
import type { ChipColor } from "@/theme";
import { t } from "@/i18n/t";

export interface TodayScheduleRowData {
  key: string;
  startLabel: string;
  subjectName: string;
  roomName: string | null;
}

export interface NextLessonData {
  subjectName: string;
  timeRangeLabel: string;
  roomName: string | null;
  teacherName: string | null;
  countdownLabel: string;
}

export type StudentStatKey = "attendance" | "leave" | "grades" | "library";

export interface StatTileValue {
  key: StudentStatKey;
  value: string;
  /** Overrides the tile's default category label -- the library tile shows
   * a due date here instead of a generic "books" label. */
  label?: string;
}

export interface StudentHomeViewProps {
  eyebrow: string;
  greetingName: string;
  profileName: string;
  unreadCount: number;
  onPressNotifications: () => void;
  onPressProfile: () => void;
  isLoadingSchedule: boolean;
  nextLesson: NextLessonData | null;
  statTiles: StatTileValue[];
  /** Navigation is injected rather than called from in here, so this stays
   * a plain presentational component with no expo-router dependency (see
   * __tests__/student-home-view.test.tsx, which renders it standalone). */
  onPressTile: (key: StudentStatKey) => void;
  todayRows: TodayScheduleRowData[];
}

const TILE_META: Record<StudentStatKey, { icon: LucideIcon; color: ChipColor }> = {
  attendance: { icon: CalendarCheck, color: "green" },
  leave: { icon: ClipboardList, color: "amber" },
  grades: { icon: Star, color: "purple" },
  library: { icon: BookOpen, color: "blue" },
};

function tileLabel(key: StudentStatKey): string {
  switch (key) {
    case "attendance":
      return t("home.stat_attendance");
    case "leave":
      return t("home.stat_leave_pending");
    case "grades":
      return t("home.stat_grades");
    case "library":
      return t("home.stat_library_active");
  }
}

/** Presentational student home screen (docs/design-reference-hijau-segar.html):
 * greeting header, "next lesson" hero, a 2x2 stat grid that only shows the
 * tiles its data actually resolved, and today's schedule. Every prop is
 * plain data so this renders without a network, auth context, or React
 * Query -- see __tests__/student-home-view.test.tsx. */
export function StudentHomeView({
  eyebrow,
  greetingName,
  profileName,
  unreadCount,
  onPressNotifications,
  onPressProfile,
  isLoadingSchedule,
  nextLesson,
  statTiles,
  onPressTile,
  todayRows,
}: StudentHomeViewProps): React.JSX.Element {
  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
        <HomeHeader
          eyebrow={eyebrow}
          greetingName={greetingName}
          profileName={profileName}
          unreadCount={unreadCount}
          onPressNotifications={onPressNotifications}
          onPressProfile={onPressProfile}
        />

        <View className="px-5 pt-5">
          {isLoadingSchedule ? (
            <Skeleton height={110} className="rounded-card" />
          ) : nextLesson ? (
            <View
              className="gap-2 rounded-card bg-accent-soft p-[18px] dark:bg-accent-soft-dark"
              testID="next-lesson-card"
            >
              <NextLessonCard data={nextLesson} />
            </View>
          ) : (
            <Card className="items-start gap-1 p-[18px]" testID="next-lesson-empty">
              <Text className="font-body-semibold text-sm text-muted dark:text-muted-dark">
                {t("home.next_lesson")}
              </Text>
              <Text className="text-base text-ink dark:text-ink-dark">
                {t("home.no_more_lessons_today")}
              </Text>
            </Card>
          )}
        </View>

        {statTiles.length > 0 ? (
          <View className="flex-row flex-wrap gap-3 px-5 pt-3.5">
            {statTiles.map((tile) => {
              const meta = TILE_META[tile.key];
              return (
                <View key={tile.key} className="min-w-[45%] flex-1 flex-row">
                  <StatTile
                    icon={meta.icon}
                    value={tile.value}
                    label={tile.label ?? tileLabel(tile.key)}
                    color={meta.color}
                    onPress={() => onPressTile(tile.key)}
                    testID={`stat-tile-${tile.key}`}
                  />
                </View>
              );
            })}
          </View>
        ) : null}

        <View className="gap-2.5 px-5 pt-5">
          <View className="flex-row items-baseline justify-between">
            <Text className="font-heading-bold text-[17px] text-ink dark:text-ink-dark">
              {t("home.today_title")}
            </Text>
          </View>
          {isLoadingSchedule ? (
            <Skeleton height={96} className="rounded-card" />
          ) : todayRows.length === 0 ? (
            <Card className="p-4">
              <Text className="text-sm text-muted dark:text-muted-dark">
                {t("home.no_schedule_today")}
              </Text>
            </Card>
          ) : (
            <Card testID="today-schedule-card">
              {todayRows.map((row, index) => (
                <View
                  key={row.key}
                  className={
                    index === todayRows.length - 1
                      ? "flex-row items-center gap-3 px-4 py-3.5"
                      : "flex-row items-center gap-3 border-b border-line px-4 py-3.5 dark:border-line-dark"
                  }
                >
                  <Text className="w-11 font-body-semibold text-sm text-accent-text dark:text-accent-text-dark">
                    {row.startLabel}
                  </Text>
                  <Text className="flex-1 font-body-semibold text-base text-ink dark:text-ink-dark">
                    {row.subjectName}
                  </Text>
                  {row.roomName ? (
                    <Text className="text-xs text-muted dark:text-muted-dark">{row.roomName}</Text>
                  ) : null}
                </View>
              ))}
            </Card>
          )}
        </View>

        <View className="pt-5">
          <View className="flex-row items-center justify-between px-5 pb-2">
            <Text className="font-heading-bold text-[17px] text-ink dark:text-ink-dark">
              {t("home.announcements")}
            </Text>
          </View>
          <AnnouncementsList limit={3} />
        </View>
      </ScrollView>
    </View>
  );
}

function NextLessonCard({ data }: { data: NextLessonData }): React.JSX.Element {
  return (
    <>
      <View className="flex-row items-center justify-between">
        <Text className="font-body-semibold text-sm text-accent-text dark:text-accent-text-dark">
          {t("home.next_lesson")}
        </Text>
        <View className="rounded-chip bg-accent px-2.5 py-1">
          <Text className="font-body-bold text-xs text-accent-fg">{data.countdownLabel}</Text>
        </View>
      </View>
      <Text
        className="text-ink dark:text-ink-dark"
        style={{ fontFamily: "Manrope_700Bold", fontSize: 26, letterSpacing: -0.2 }}
      >
        {data.subjectName}
      </Text>
      <Text className="text-sm text-accent-text dark:text-accent-text-dark">
        {[data.timeRangeLabel, data.roomName, data.teacherName].filter(Boolean).join(" · ")}
      </Text>
    </>
  );
}
