import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { CalendarCheck, ClipboardList, ClockAlert, DoorOpen } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { AnnouncementsList } from "@/components/screens/AnnouncementsList";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  useClasses,
  useOpenSession,
  useSubjects,
  useTodaySessions,
  useUnreadCount,
} from "@/lib/api/hooks";
import { showToast } from "@/components/ui/Toast";
import { t } from "@/i18n/t";

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <View className="gap-2 pt-4">
      <View className="flex-row items-center justify-between px-4">
        <Text className="text-md font-medium text-ink dark:text-ink-dark">{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function QuickLink({ icon: Icon, label, href }: { icon: LucideIcon; label: string; href: string }): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      className="flex-1 items-center gap-2 rounded-input border border-line bg-surface px-2 py-3 dark:border-line-dark dark:bg-surface-dark"
    >
      <Icon size={22} strokeWidth={1.75} color="#1F3A5F" />
      <Text className="text-center text-xs text-ink dark:text-ink-dark">{label}</Text>
    </Pressable>
  );
}

/** Role-aware home: teachers see today's sessions, students their permit shortcuts; everyone sees announcements. */
export function HomeScreen(): React.JSX.Element {
  const { me, activeTabGroup } = useAuth();
  const isTeacher = activeTabGroup === "teacher";
  const isStudent = activeTabGroup === "student";
  const sessions = useTodaySessions(isTeacher);
  const classes = useClasses();
  const subjects = useSubjects();
  const unread = useUnreadCount();
  const open = useOpenSession();
  const classMap = new Map((classes.data?.data ?? []).map((c) => [c.id, c.name]));
  const subjectMap = new Map((subjects.data?.data ?? []).map((s) => [s.id, s.name]));

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("home.title")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
        <View className="px-4 pt-4">
          <Text className="text-md font-medium text-ink dark:text-ink-dark">{me?.name}</Text>
          <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
            {me?.active_academic_year?.label ?? ""}{(unread.data?.count ?? 0) > 0 ? ` · ${unread.data?.count} ${t("home.unread")}` : ""}
          </Text>
        </View>

        {isTeacher ? (
          <Section title={t("home.today_sessions")}>
            {sessions.isLoading ? (
              <View className="gap-2 px-4"><Skeleton height={64} /><Skeleton height={64} /></View>
            ) : (sessions.data?.data ?? []).length === 0 ? (
              <Text className="px-4 text-sm text-ink/60 dark:text-ink-dark/60">{t("home.no_sessions")}</Text>
            ) : (
              <View className="gap-2 px-4">
                {(sessions.data?.data ?? []).map((s) => (
                  <View key={s.schedule_id} className="flex-row items-center gap-3 rounded-input border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark">
                    <View className="flex-1">
                      <Text className="text-base text-ink dark:text-ink-dark">{classMap.get(s.class_id) ?? "-"} · {subjectMap.get(s.subject_id) ?? ""}</Text>
                      <Text className="text-sm text-ink/60 dark:text-ink-dark/60">{s.submitted_at ? t("home.submitted") : t("home.pending")}</Text>
                    </View>
                    <Button
                      label={s.submitted_at ? t("home.open_session") : t("home.fill_attendance")}
                      variant={s.submitted_at ? "secondary" : "primary"}
                      loading={open.isPending && open.variables.schedule_id === s.schedule_id}
                      onPress={() => {
                        open.mutate(
                          { schedule_id: s.schedule_id, date: s.date },
                          {
                            onSuccess: (detail) => router.push({ pathname: "/attendance/[sessionId]", params: { sessionId: detail.id } }),
                            onError: () => showToast(t("common.error"), "error"),
                          },
                        );
                      }}
                    />
                  </View>
                ))}
              </View>
            )}
          </Section>
        ) : null}

        {isStudent ? (
          <Section title={t("home.my_attendance")}>
            <View className="flex-row gap-2 px-4">
              <QuickLink icon={CalendarCheck} label={t("home.view_calendar")} href="/attendance/calendar" />
              <QuickLink icon={DoorOpen} label={t("home.exit_permits")} href="/permits/exit" />
              <QuickLink icon={ClockAlert} label={t("home.late_arrival")} href="/permits/late" />
              <QuickLink icon={ClipboardList} label={t("home.leave_requests")} href="/permits/leave" />
            </View>
          </Section>
        ) : null}

        <Section
          title={t("home.announcements")}
          action={<Button label={t("home.see_all")} variant="ghost" onPress={() => router.push("/announcements")} />}
        >
          <AnnouncementsList limit={3} />
        </Section>
      </ScrollView>
    </View>
  );
}
