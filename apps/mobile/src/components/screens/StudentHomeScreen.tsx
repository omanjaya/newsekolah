import { router } from "expo-router";
import {
  StudentHomeView,
  type NextLessonData,
  type StatTileValue,
  type StudentStatKey,
} from "@/components/screens/StudentHomeView";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  useMemberLoans,
  useMyCalendar,
  useMyGrades,
  useMyLeaveRequests,
  useMyTodaySchedule,
  usePeriods,
  useRooms,
  useSubjects,
  useTeachers,
  useUnreadCount,
} from "@/lib/api/hooks";
import { buildScheduleRows, isoDayOfWeek, pickNextLesson } from "@/lib/home/schedule";
import { computeAttendancePercent, computeGradedComponentsCount } from "@/lib/home/stat-tiles";
import { getLocale, t } from "@/i18n/t";

const WEEKDAY_NAMES: Record<"id" | "en", string[]> = {
  // Sunday-first, matching Date#getDay().
  id: ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};
const MONTH_NAMES: Record<"id" | "en", string[]> = {
  id: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

function formatEyebrowDate(date: Date): string {
  const locale = getLocale();
  const weekday = WEEKDAY_NAMES[locale][date.getDay()];
  const month = MONTH_NAMES[locale][date.getMonth()];
  return `${weekday ?? ""}, ${String(date.getDate())} ${month ?? ""}`;
}

function formatDueLabel(dueOn: string): string {
  const date = new Date(`${dueOn}T00:00:00`);
  const locale = getLocale();
  const weekday = WEEKDAY_NAMES[locale][date.getDay()] ?? dueOn;
  return `${t("home.stat_library_due_prefix")} ${weekday}`;
}

function monthKey(date: Date): string {
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const TILE_HREF: Record<StudentStatKey, string> = {
  attendance: "/attendance/calendar",
  leave: "/permits/leave",
  grades: "/grades",
  library: "/library/overdue",
};

function countdownLabel(minutes: number): string {
  if (minutes < 60) return `${String(minutes)} ${t("home.minutes_left")}`;
  return `${String(Math.round(minutes / 60))} ${t("home.hours_left")}`;
}

/** Data-fetching student home screen: composes real query results into
 * StudentHomeView's plain props. Every figure that has no settled query
 * data is simply left out of `statTiles` -- see stat-tiles.ts and
 * schedule.ts for the underlying rules. */
export function StudentHomeScreen(): React.JSX.Element | null {
  const { me } = useAuth();
  const now = new Date();
  const dayOfWeek = isoDayOfWeek(now);

  const unread = useUnreadCount();
  const calendar = useMyCalendar(monthKey(now));
  const leaveRequests = useMyLeaveRequests(true);
  const grades = useMyGrades();
  const loans = useMemberLoans(me?.id ?? "", false);
  const scheduleQuery = useMyTodaySchedule(dayOfWeek);
  const periods = usePeriods();
  const subjects = useSubjects();
  const rooms = useRooms();
  const teachers = useTeachers();

  if (!me) return null;

  const subjectNames = new Map((subjects.data?.data ?? []).map((s) => [s.id, s.name]));
  const roomNames = new Map((rooms.data?.data ?? []).map((r) => [r.id, r.name]));
  const teacherNames = new Map((teachers.data?.data ?? []).map((u) => [u.id, u.name]));

  const scheduleRows = buildScheduleRows(
    scheduleQuery.data?.data ?? [],
    periods.data ?? [],
    now,
    subjectNames,
    roomNames,
    teacherNames,
  );
  const next = pickNextLesson(scheduleRows, now);
  const nextLesson: NextLessonData | null = next
    ? {
        subjectName: next.row.subjectName,
        timeRangeLabel: `${next.row.startLabel} - ${next.row.endLabel}`,
        roomName: next.row.roomName,
        teacherName: next.row.teacherName,
        countdownLabel: next.inProgress
          ? t("home.lesson_in_progress")
          : countdownLabel(next.minutesUntilStart),
      }
    : null;

  const statTiles: StatTileValue[] = [];

  const attendancePercent = calendar.data
    ? computeAttendancePercent(calendar.data.data)
    : undefined;
  if (attendancePercent !== undefined) {
    statTiles.push({ key: "attendance", value: `${String(attendancePercent)}%` });
  }

  if (leaveRequests.data) {
    const pending = leaveRequests.data.data.filter((r) => r.status === "in_progress").length;
    statTiles.push({ key: "leave", value: String(pending) });
  }

  if (grades.data) {
    statTiles.push({
      key: "grades",
      value: String(computeGradedComponentsCount(grades.data.subjects)),
    });
  }

  if (loans.data) {
    const active = loans.data.data.filter((l) => l.status === "active");
    if (active.length > 0) {
      const earliestDue = active.reduce(
        (min, l) => (l.due_on < min ? l.due_on : min),
        active[0]?.due_on ?? "",
      );
      statTiles.push({
        key: "library",
        value: `${String(active.length)} ${t("home.stat_library_unit")}`,
        label: formatDueLabel(earliestDue),
      });
    } else {
      statTiles.push({ key: "library", value: "0", label: t("home.stat_library_active") });
    }
  }

  const isLoadingSchedule = scheduleQuery.isLoading || periods.isLoading || subjects.isLoading;

  return (
    <StudentHomeView
      eyebrow={`${me.tenant.name} · ${formatEyebrowDate(now)}`}
      greetingName={me.name.split(" ")[0] ?? me.name}
      profileName={me.name}
      unreadCount={unread.data?.count ?? 0}
      onPressNotifications={() => router.push("/(student)/notifications")}
      onPressProfile={() => router.push("/(student)/profile")}
      isLoadingSchedule={isLoadingSchedule}
      nextLesson={nextLesson}
      statTiles={statTiles}
      onPressTile={(key) => router.push(TILE_HREF[key])}
      todayRows={scheduleRows.map((row) => ({
        key: row.key,
        startLabel: row.startLabel,
        subjectName: row.subjectName,
        roomName: row.roomName,
      }))}
    />
  );
}
