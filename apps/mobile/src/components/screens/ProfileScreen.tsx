import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Smartphone } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { ListRow } from "@/components/ui/ListRow";
import { Button } from "@/components/ui/Button";
import { listSessions, revokeSession } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { resolveTabGroups } from "@/lib/auth/roles";
import { showToast } from "@/components/ui/Toast";
import { t } from "@/i18n/t";
import type { ProfileKind } from "@/lib/api-types";

const HOME_ROUTE_BY_GROUP: Record<ProfileKind, string> = {
  student: "/(student)/home",
  teacher: "/(teacher)/home",
  staff: "/(staff)/home",
  parent: "/(parent)/home",
};

const GROUP_LABEL_KEY: Record<
  ProfileKind,
  "profile.role.student" | "profile.role.teacher" | "profile.role.staff" | "profile.role.parent"
> = {
  student: "profile.role.student",
  teacher: "profile.role.teacher",
  staff: "profile.role.staff",
  parent: "profile.role.parent",
};

export function ProfileScreen(): React.JSX.Element {
  const { me, activeTabGroup, setActiveTabGroup, availableTabGroups, signOut } = useAuth();
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({ queryKey: ["sessions"], queryFn: listSessions });
  const revokeMutation = useMutation({
    mutationFn: revokeSession,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: () => showToast(t("error.generic_title"), "error"),
  });

  if (!me) return <View className="flex-1 bg-bg dark:bg-bg-dark" />;

  function switchTo(group: ProfileKind): void {
    setActiveTabGroup(group);
    router.replace(HOME_ROUTE_BY_GROUP[group]);
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("profile.title")} />
      <ScrollView>
        <View className="flex-row items-center gap-3 px-4 py-4">
          <Avatar name={me.name} size={56} />
          <View className="flex-1">
            <Text className="text-md font-medium text-ink dark:text-ink-dark">{me.name}</Text>
            <Text className="text-sm text-ink/60 dark:text-ink-dark/60">{me.username}</Text>
            <Text className="text-sm text-ink/60 dark:text-ink-dark/60">{me.tenant.name}</Text>
          </View>
        </View>

        {availableTabGroups.length > 1 ? (
          <View className="border-t border-line px-4 py-3 dark:border-line-dark">
            <Text className="mb-2 text-sm font-medium text-ink dark:text-ink-dark">
              {t("profile.switch_role")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {resolveTabGroups(me).map((group) => (
                <Button
                  key={group}
                  label={t(GROUP_LABEL_KEY[group])}
                  variant={group === activeTabGroup ? "primary" : "secondary"}
                  onPress={() => switchTo(group)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View className="border-t border-line dark:border-line-dark">
          <View className="px-4 py-3">
            <Text className="text-sm font-medium text-ink dark:text-ink-dark">
              {t("profile.sessions_title")}
            </Text>
          </View>
          {(sessionsQuery.data?.data ?? []).map((session) => (
            <ListRow
              key={session.id}
              leading={<Smartphone size={20} strokeWidth={1.75} color="#8A8A8A" />}
              title={session.device_name ?? session.client}
              subtitle={session.is_current ? t("profile.sessions_current") : session.last_seen_at}
              trailing={
                session.is_current ? undefined : (
                  <Button
                    label={t("profile.sessions_revoke")}
                    variant="ghost"
                    onPress={() => revokeMutation.mutate(session.id)}
                  />
                )
              }
            />
          ))}
        </View>

        <View className="px-4 py-6">
          <Button
            label={t("common.logout")}
            variant="destructive"
            onPress={() => {
              void signOut().then(() => router.replace("/"));
            }}
            fullWidth
          />
        </View>
      </ScrollView>
    </View>
  );
}
