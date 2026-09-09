import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSessions, useRevokeSession } from "@newsekolah/api-client/react";
import { Smartphone } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { ListRow } from "@/components/ui/ListRow";
import { Button } from "@/components/ui/Button";
import { getApiClient } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { resolveTabGroups } from "@/lib/auth/roles";
import { showToast } from "@/components/ui/Toast";
import { t, tShared } from "@/i18n/t";
import type { ProfileKind } from "@/lib/api/types";

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
  const client = getApiClient();

  const sessionsQuery = useSessions(client);
  const revokeMutation = useRevokeSession(client);

  if (!me) return <View className="flex-1 bg-bg dark:bg-bg-dark" />;

  function switchTo(group: ProfileKind): void {
    setActiveTabGroup(group);
    router.replace(HOME_ROUTE_BY_GROUP[group]);
  }

  function revoke(sessionId: string): void {
    revokeMutation.mutate(sessionId, {
      onError: () => showToast(tShared("common.states.error"), "error"),
    });
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
              {tShared("auth.sessions.title")}
            </Text>
          </View>
          {(sessionsQuery.data?.data ?? []).map((session) => (
            <ListRow
              key={session.id}
              leading={<Smartphone size={20} strokeWidth={1.75} color="#8A8A8A" />}
              title={session.device_name ?? session.client}
              subtitle={
                session.is_current ? tShared("auth.sessions.currentDevice") : session.last_seen_at
              }
              trailing={
                session.is_current ? undefined : (
                  <Button
                    label={tShared("auth.sessions.revoke")}
                    variant="ghost"
                    onPress={() => revoke(session.id)}
                  />
                )
              }
            />
          ))}
        </View>

        <View className="px-4 py-6">
          <Button
            label={tShared("common.actions.logout")}
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
