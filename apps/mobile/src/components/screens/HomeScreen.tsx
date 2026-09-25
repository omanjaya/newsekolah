import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import {
  BookMarked,
  ClipboardList,
  ClockAlert,
  NotebookPen,
  Repeat,
  ScanLine,
  Users,
} from "lucide-react-native";
import { HomeHeader } from "@/components/ui/HomeHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { QuickLink } from "@/components/ui/QuickLink";
import { AnnouncementsList } from "@/components/screens/AnnouncementsList";
import { OfflineQueueBanner } from "@/components/screens/OfflineQueueBanner";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasRole } from "@/lib/auth/roles";
import {
  useClasses,
  useOpenSession,
  useSubjects,
  useTodaySessions,
  useUnreadCount,
} from "@/lib/api/hooks";
import { showToast } from "@/components/ui/Toast";
import { t } from "@/i18n/t";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View className="gap-2 pt-5">
      <View className="flex-row items-center justify-between px-5">
        <Text className="font-heading-bold text-[17px] text-ink dark:text-ink-dark">{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

/** Teacher and staff home (docs/design-reference-hijau-segar.html applied to
 * their own content, not the student layout): today's sessions to teach or
 * fill attendance for, role-specific tool shortcuts, and announcements. The
 * student home screen is its own component (StudentHomeScreen) -- see
 * (student)/home.tsx. */
export function HomeScreen(): React.JSX.Element {
  const { me, activeTabGroup } = useAuth();
  const isTeacher = activeTabGroup === "teacher";
  const isStaff = activeTabGroup === "staff";
  const isHomeroomTeacher = isTeacher && me != null && hasRole(me, "homeroom_teacher");
  const isDutyTeacher = isStaff && me != null && hasRole(me, "duty_teacher");
  const isCounselor = isStaff && me != null && hasRole(me, "counselor");
  const isLibrarian = isStaff && me != null && hasRole(me, "librarian");
  const sessions = useTodaySessions(isTeacher);
  const classes = useClasses();
  const subjects = useSubjects();
  const unread = useUnreadCount();
  const open = useOpenSession();
  const classMap = new Map((classes.data?.data ?? []).map((c) => [c.id, c.name]));
  const subjectMap = new Map((subjects.data?.data ?? []).map((s) => [s.id, s.name]));

  if (!me || !activeTabGroup) return <View className="flex-1 bg-bg dark:bg-bg-dark" />;

  const notificationsRoute = `/(${activeTabGroup})/notifications`;
  const profileRoute = `/(${activeTabGroup})/profile`;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
        <HomeHeader
          eyebrow={me.tenant.name}
          greetingName={me.name.split(" ")[0] ?? me.name}
          profileName={me.name}
          unreadCount={unread.data?.count ?? 0}
          onPressNotifications={() => router.push(notificationsRoute)}
          onPressProfile={() => router.push(profileRoute)}
        />

        {isTeacher ? (
          <View className="px-5 pt-3">
            <OfflineQueueBanner />
          </View>
        ) : null}

        {isTeacher ? (
          <Section title={t("home.today_sessions")}>
            {sessions.isLoading ? (
              <View className="gap-2 px-5">
                <Skeleton height={72} className="rounded-card" />
                <Skeleton height={72} className="rounded-card" />
              </View>
            ) : (sessions.data?.data ?? []).length === 0 ? (
              <Card className="mx-5 p-4">
                <Text className="text-sm text-muted dark:text-muted-dark">
                  {t("home.no_sessions")}
                </Text>
              </Card>
            ) : (
              <View className="gap-2.5 px-5">
                {(sessions.data?.data ?? []).map((s) => (
                  <Card key={s.schedule_id} className="flex-row items-center gap-3 p-4">
                    <View className="flex-1">
                      <Text className="font-body-semibold text-base text-ink dark:text-ink-dark">
                        {classMap.get(s.class_id) ?? "-"} · {subjectMap.get(s.subject_id) ?? ""}
                      </Text>
                      <Text className="text-sm text-muted dark:text-muted-dark">
                        {s.submitted_at ? t("home.submitted") : t("home.pending")}
                      </Text>
                    </View>
                    <Button
                      label={s.submitted_at ? t("home.open_session") : t("home.fill_attendance")}
                      variant={s.submitted_at ? "secondary" : "primary"}
                      loading={open.isPending && open.variables.schedule_id === s.schedule_id}
                      onPress={() => {
                        open.mutate(
                          { schedule_id: s.schedule_id, date: s.date },
                          {
                            onSuccess: (detail) =>
                              router.push({
                                pathname: "/attendance/[sessionId]",
                                params: { sessionId: detail.id },
                              }),
                            onError: () => showToast(t("common.error"), "error"),
                          },
                        );
                      }}
                    />
                  </Card>
                ))}
              </View>
            )}
          </Section>
        ) : null}

        {isTeacher ? (
          <Section title={t("home.teacher_tools")}>
            <View className="flex-row flex-wrap gap-2.5 px-5">
              <QuickLink icon={NotebookPen} label={t("home.journal")} href="/journal" />
              <QuickLink icon={Repeat} label={t("home.substitutions")} href="/substitutions" />
              {isHomeroomTeacher ? (
                <QuickLink icon={Users} label={t("home.homeroom")} href="/attendance/homeroom" />
              ) : null}
            </View>
          </Section>
        ) : null}

        {isDutyTeacher || isCounselor ? (
          <Section title={t("home.duty_tools")}>
            <View className="flex-row flex-wrap gap-2.5 px-5">
              {isDutyTeacher ? (
                <QuickLink
                  icon={ClockAlert}
                  label={t("home.late_queue")}
                  href="/review/late-arrivals"
                />
              ) : null}
              <QuickLink
                icon={ClipboardList}
                label={t("home.leave_queue")}
                href="/review/leave-requests"
              />
            </View>
          </Section>
        ) : null}

        {isLibrarian ? (
          <Section title={t("home.library_tools")}>
            <View className="flex-row flex-wrap gap-2.5 px-5">
              <QuickLink icon={BookMarked} label={t("home.library_desk")} href="/library/desk" />
              <QuickLink icon={ScanLine} label={t("home.library_opname")} href="/library/opname" />
            </View>
          </Section>
        ) : null}

        <Section
          title={t("home.announcements")}
          action={
            <Button
              label={t("home.see_all")}
              variant="ghost"
              onPress={() => router.push("/announcements")}
            />
          }
        >
          <AnnouncementsList limit={3} />
        </Section>
      </ScrollView>
    </View>
  );
}
