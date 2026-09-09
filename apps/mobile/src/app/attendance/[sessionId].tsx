import { useMemo, useState } from "react";
import { FlatList, Pressable, Switch, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Lock } from "lucide-react-native";
import { ApiError } from "@newsekolah/api-client";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { showToast } from "@/components/ui/Toast";
import {
  useSaveEntries,
  useSession,
  type SaveEntriesRequest,
  type SessionDetail,
} from "@/lib/api/hooks";
import { getOfflineQueue } from "@/lib/offline/queue";
import { useFlushOfflineQueue } from "@/lib/offline/sync";
import { cn } from "@/lib/cn";
import { t } from "@/i18n/t";

export default function AttendanceSessionRoute(): React.JSX.Element {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { data, isLoading } = useSession(sessionId);
  if (isLoading || !data) {
    return (
      <View className="flex-1 bg-bg dark:bg-bg-dark">
        <ScreenHeader title={t("attendance.title")} showBack />
        <View className="gap-2 p-4">
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      </View>
    );
  }
  return <Editor key={data.submitted_at ?? "open"} session={data} />;
}

/** One tap per student, all present by default, search and a not-present filter (docs/07 section 4). */
function Editor({ session }: { session: SessionDetail }): React.JSX.Element {
  const save = useSaveEntries(session.id);
  const flushOfflineQueue = useFlushOfflineQueue();
  const [submitting, setSubmitting] = useState(false);
  const defaultCode = session.statuses.find((s) => s.counts_as_present)?.code ?? "H";
  const presentCodes = useMemo(
    () => new Set(session.statuses.filter((s) => s.counts_as_present).map((s) => s.code)),
    [session.statuses],
  );
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      session.roster.map((r) => [r.student_user_id, r.current_status ?? defaultCode]),
    ),
  );
  const [search, setSearch] = useState("");
  const [onlyAbsent, setOnlyAbsent] = useState(false);
  const [topic, setTopic] = useState(session.journal_topic ?? "");
  const [activities, setActivities] = useState(session.journal_activities ?? "");
  const [reason, setReason] = useState("");
  const isCorrection = Boolean(session.submitted_at);

  const visible = session.roster.filter((r) => {
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (onlyAbsent && presentCodes.has(statuses[r.student_user_id] ?? defaultCode)) return false;
    return true;
  });

  /**
   * Attendance taken with no connection must not be lost: a genuine network
   * failure (fetch never reaching the server, as opposed to an ApiError the
   * server actually answered with) queues this save for the offline
   * mutation queue instead of failing outright (docs/10-mobile-strategy.md
   * section 3, DESIGN.md on trustworthy operational tools). A 409 means the
   * server already has a record for this session -- typically someone else
   * submitted it while this device was offline -- and retrying the same
   * body would only 409 again, so that path says so plainly instead of
   * silently queuing it.
   */
  async function submit() {
    if (isCorrection && !reason.trim()) {
      showToast(t("attendance.reason_required"), "error");
      return;
    }
    const body: SaveEntriesRequest = {
      mode: isCorrection ? "correction" : "normal",
      ...(isCorrection ? { reason: reason.trim() } : {}),
      entries: session.roster
        .filter((r) => !r.blocked)
        .map((r) => ({
          student_user_id: r.student_user_id,
          status_code: statuses[r.student_user_id] ?? defaultCode,
        })),
      ...(topic.trim() ? { journal: { topic: topic.trim(), activities: activities.trim() } } : {}),
    };

    setSubmitting(true);
    try {
      await save.mutateAsync(body);
      showToast(t("attendance.saved"), "success");
      router.back();
    } catch (error) {
      if (error instanceof ApiError) {
        showToast(error.status === 409 ? t("attendance.conflict") : t("common.error"), "error");
        return;
      }
      await getOfflineQueue().enqueueOrReplace(
        "PUT",
        `/v1/attendance/sessions/${session.id}/entries`,
        body,
      );
      showToast(t("attendance.queued_offline"), "success");
      void flushOfflineQueue();
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader title={t("attendance.title")} showBack />
      <View className="gap-2 px-4 py-2">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("attendance.search")}
          className="rounded-input border border-line bg-surface px-3 py-2 text-base text-ink dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark"
        />
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-ink dark:text-ink-dark">{t("attendance.only_absent")}</Text>
          <Switch value={onlyAbsent} onValueChange={setOnlyAbsent} />
        </View>
      </View>
      <FlatList
        data={visible}
        keyExtractor={(r) => r.student_user_id}
        contentContainerStyle={{ paddingBottom: 220 }}
        renderItem={({ item, index }) => {
          const current = statuses[item.student_user_id] ?? defaultCode;
          return (
            <View className="gap-2 border-b border-line px-4 py-3 dark:border-line-dark">
              <View className="flex-row items-center gap-2">
                <Text className="w-6 text-right text-xs text-ink/50">{index + 1}</Text>
                <Text className="flex-1 text-base text-ink dark:text-ink-dark">{item.name}</Text>
                {item.blocked ? <Lock size={14} color="#8A8A8A" /> : null}
              </View>
              {item.blocked ? (
                <Text className="pl-8 text-xs text-ink/60 dark:text-ink-dark/60">
                  {item.blocked_reason ?? t("attendance.locked")}
                </Text>
              ) : (
                <View className="flex-row pl-8" accessibilityRole="radiogroup">
                  {session.statuses.map((s) => {
                    const selected = current === s.code;
                    return (
                      <Pressable
                        key={s.code}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={s.label}
                        onPress={() =>
                          setStatuses((prev) => ({ ...prev, [item.student_user_id]: s.code }))
                        }
                        className={cn(
                          "min-h-11 min-w-11 items-center justify-center border border-line px-3 first:rounded-l-input last:rounded-r-input dark:border-line-dark",
                          selected ? "bg-accent" : "bg-surface dark:bg-surface-dark",
                        )}
                      >
                        <Text
                          className={cn(
                            "text-sm font-medium",
                            selected ? "text-white" : "text-ink dark:text-ink-dark",
                          )}
                        >
                          {s.code}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          );
        }}
        ListFooterComponent={
          <View className="gap-2 px-4 pt-4">
            <Text className="text-md font-medium text-ink dark:text-ink-dark">
              {t("attendance.journal")}
            </Text>
            {session.previous_journal_topic ? (
              <Text className="text-xs text-ink/60 dark:text-ink-dark/60">
                {session.previous_journal_topic}
              </Text>
            ) : null}
            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder={t("attendance.topic")}
              className="rounded-input border border-line bg-surface px-3 py-2 text-base text-ink dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark"
            />
            <TextInput
              value={activities}
              onChangeText={setActivities}
              placeholder={t("attendance.activities")}
              multiline
              className="min-h-20 rounded-input border border-line bg-surface px-3 py-2 text-base text-ink dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark"
            />
          </View>
        }
      />
      <View className="absolute inset-x-0 bottom-0 gap-2 border-t border-line bg-bg px-4 pb-8 pt-3 dark:border-line-dark dark:bg-bg-dark">
        {isCorrection ? (
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={t("attendance.reason")}
            className="rounded-input border border-line bg-surface px-3 py-2 text-base text-ink dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark"
          />
        ) : null}
        <Button
          label={isCorrection ? t("attendance.save_correction") : t("attendance.save")}
          fullWidth
          loading={submitting}
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}
