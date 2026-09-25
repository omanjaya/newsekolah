import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ClipboardList } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WorkflowSteps } from "@/components/screens/WorkflowSteps";
import {
  useLeaveRequest,
  useMyLeaveRequests,
  useSubmitLeaveRequest,
  type LeaveCategory,
} from "@/lib/api/hooks";
import { t, type MobileMessageKey } from "@/i18n/t";

const CATEGORIES: LeaveCategory[] = ["sick", "religious_ceremony", "dispensation", "other"];
const INPUT =
  "rounded-input border border-line bg-surface px-3 py-2 text-base text-ink dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark";

export default function LeaveRequestsRoute(): React.JSX.Element {
  const list = useMyLeaveRequests(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const items = list.data?.data ?? [];

  if (openId) return <LeaveDetail id={openId} onBack={() => setOpenId(null)} />;
  if (creating)
    return (
      <LeaveForm
        onDone={(id) => {
          setCreating(false);
          setOpenId(id);
        }}
        onBack={() => setCreating(false)}
      />
    );

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader
        title={t("leave.title")}
        showBack
        right={
          <Button label={t("leave.submit")} variant="ghost" onPress={() => setCreating(true)} />
        }
      />
      {list.isLoading ? (
        <View className="gap-2 p-4">
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t("leave.empty")}
          actionLabel={t("leave.submit")}
          onAction={() => setCreating(true)}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {items.map((r) => (
            <Pressable
              key={r.instance_id}
              accessibilityRole="button"
              onPress={() => setOpenId(r.instance_id)}
              className="rounded-input border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark"
            >
              <Text className="text-base text-ink dark:text-ink-dark">
                {t(`leave.category.${r.category}` as MobileMessageKey)} · {r.starts_on} -{" "}
                {r.ends_on}
              </Text>
              <Text className="text-sm text-accent">
                {t(`permits.status.${r.status}` as MobileMessageKey)}
                {r.letter_number ? ` · ${r.letter_number}` : ""}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function LeaveForm({
  onDone,
  onBack,
}: {
  onDone: (id: string) => void;
  onBack: () => void;
}): React.JSX.Element {
  const submit = useSubmitLeaveRequest();
  const [category, setCategory] = useState<LeaveCategory>("sick");
  const [reason, setReason] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const valid =
    reason.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(startsOn) &&
    /^\d{4}-\d{2}-\d{2}$/.test(endsOn) &&
    endsOn >= startsOn;
  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader
        title={t("leave.submit")}
        right={<Button label={t("common.back")} variant="ghost" onPress={onBack} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text className="text-sm text-ink dark:text-ink-dark">{t("leave.category")}</Text>
        <View className="flex-row flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ selected: category === c }}
              onPress={() => setCategory(c)}
              className={`rounded-input border px-3 py-2 ${category === c ? "border-accent bg-accent" : "border-line bg-surface dark:border-line-dark dark:bg-surface-dark"}`}
            >
              <Text
                className={
                  category === c ? "text-sm text-white" : "text-sm text-ink dark:text-ink-dark"
                }
              >
                {t(`leave.category.${c}` as MobileMessageKey)}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={startsOn}
          onChangeText={setStartsOn}
          placeholder={t("leave.starts")}
          autoCapitalize="none"
          className={INPUT}
        />
        <TextInput
          value={endsOn}
          onChangeText={setEndsOn}
          placeholder={t("leave.ends")}
          autoCapitalize="none"
          className={INPUT}
        />
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder={t("leave.reason")}
          multiline
          className={`${INPUT} min-h-20`}
        />
        <Button
          label={t("leave.send")}
          fullWidth
          loading={submit.isPending}
          disabled={!valid}
          onPress={() =>
            submit.mutate(
              { category, reason: reason.trim(), starts_on: startsOn, ends_on: endsOn },
              { onSuccess: (d) => onDone(d.instance.id) },
            )
          }
        />
      </ScrollView>
    </View>
  );
}

function LeaveDetail({ id, onBack }: { id: string; onBack: () => void }): React.JSX.Element {
  const { data, isLoading } = useLeaveRequest(id);
  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader
        title={t("leave.title")}
        right={<Button label={t("common.back")} variant="ghost" onPress={onBack} />}
      />
      {isLoading || !data ? (
        <View className="p-4">
          <Skeleton height={200} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text className="text-base text-ink dark:text-ink-dark">
            {t(`leave.category.${data.category}` as MobileMessageKey)} · {data.starts_on} -{" "}
            {data.ends_on}
          </Text>
          <Text className="text-sm text-ink/70 dark:text-ink-dark/70">{data.reason}</Text>
          {data.letter_number ? (
            <Text className="text-sm text-ink dark:text-ink-dark">
              {t("leave.letter")}: {data.letter_number}
            </Text>
          ) : null}
          <WorkflowSteps instance={data.instance} />
        </ScrollView>
      )}
    </View>
  );
}
