import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Check, DoorOpen } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WorkflowSteps } from "@/components/screens/WorkflowSteps";
import { TokenQr } from "@/components/screens/QrSheet";
import {
  useCancelExitPermit,
  useCreateExitPermit,
  useExitPermit,
  useIssueGateToken,
  useMyExitPermits,
  usePeriods,
} from "@/lib/api/hooks";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  endLessons,
  exitReturnState,
  lessonEnded,
  schoolClock,
  upcomingLessons,
  type ExitReturnFields,
} from "@/lib/permits/exit-permit";
import { t, type MobileMessageKey } from "@/i18n/t";

/** The school's "HH:mm" now, in the tenant's time zone. */
function useSchoolClock(): string {
  const { me } = useAuth();
  return schoolClock(new Date(), me?.tenant.timezone);
}

/** "11.00", the school's time of day for an API instant. */
function timeOfDay(iso: string, timeZone: string | undefined): string {
  return schoolClock(new Date(iso), timeZone).replace(":", ".");
}

/** The return line once the student is through the gate, or null. */
function returnText(permit: ExitReturnFields, timeZone: string | undefined): string | null {
  const state = exitReturnState(permit, new Date());
  switch (state.kind) {
    case "none":
      return null;
    case "no_return":
      return t("permits.no_return");
    case "out": {
      const time = timeOfDay(state.due, timeZone);
      return state.lateMinutes > 0
        ? t("permits.not_back_late")
            .replace("{minutes}", String(state.lateMinutes))
            .replace("{time}", time)
        : t("permits.not_back").replace("{time}", time);
    }
    case "returned": {
      const time = timeOfDay(state.at, timeZone);
      if (state.lateMinutes === null) return t("permits.returned").replace("{time}", time);
      return state.lateMinutes > 0
        ? t("permits.returned_late")
            .replace("{time}", time)
            .replace("{minutes}", String(state.lateMinutes))
        : t("permits.returned_on_time").replace("{time}", time);
    }
  }
}

export default function ExitPermitsRoute(): React.JSX.Element {
  const permits = useMyExitPermits(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const items = permits.data?.data ?? [];
  const active = items.find((p) => p.status === "in_progress" || p.status === "approved");

  if (openId) return <PermitDetail id={openId} onBack={() => setOpenId(null)} />;
  if (creating)
    return (
      <CreatePermit
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
        title={t("permits.exit_title")}
        showBack
        right={
          <Button
            label={t("permits.request")}
            variant="ghost"
            disabled={Boolean(active)}
            onPress={() => setCreating(true)}
          />
        }
      />
      {permits.isLoading ? (
        <View className="gap-2 p-4">
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title={t("permits.empty")}
          actionLabel={t("permits.request")}
          onAction={() => setCreating(true)}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {items.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => setOpenId(p.id)}
              className="rounded-input border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark"
            >
              <Text className="text-base text-ink dark:text-ink-dark">
                {new Date(p.opened_at).toLocaleString("id-ID")}
              </Text>
              <Text className="text-sm text-accent">
                {t(`permits.status.${p.status}` as MobileMessageKey)}
                {p.current_stage ? ` · ${p.current_stage.label}` : ""}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function CreatePermit({
  onDone,
  onBack,
}: {
  onDone: (id: string) => void;
  onBack: () => void;
}): React.JSX.Element {
  const periods = usePeriods();
  const create = useCreateExitPermit();
  const [destination, setDestination] = useState("");
  const [startId, setStartId] = useState("");
  const [endId, setEndId] = useState("");
  const [returns, setReturns] = useState(true);
  // Only the lessons still running or to come: the API refuses a window
  // that is already over (EXIT_PERMIT_PERIOD_PASSED).
  const lessons = upcomingLessons(periods.data ?? [], useSchoolClock());
  const dayOver = periods.isSuccess && lessons.length === 0;
  const endChoices = endLessons(lessons, startId);
  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader
        title={t("permits.request")}
        right={<Button label={t("common.back")} variant="ghost" onPress={onBack} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <TextInput
          value={destination}
          onChangeText={setDestination}
          placeholder={t("permits.destination")}
          className="rounded-input border border-line bg-surface px-3 py-2 text-base text-ink dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark"
        />
        {dayOver ? (
          <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
            {t("permits.no_periods_left")}
          </Text>
        ) : null}
        <Text className="text-sm text-ink dark:text-ink-dark">{t("permits.from")}</Text>
        <PeriodPicker
          periods={lessons}
          value={startId}
          onChange={(v) => {
            setStartId(v);
            // A one-lesson permit by default; an end before the new start
            // moves onto it.
            if (!endLessons(lessons, v).some((p) => p.id === endId)) setEndId(v);
          }}
        />
        <Text className="text-sm text-ink dark:text-ink-dark">{t("permits.to")}</Text>
        <PeriodPicker periods={endChoices} value={endId} onChange={setEndId} />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: returns }}
          onPress={() => setReturns((v) => !v)}
          className="flex-row items-center gap-3 py-2"
        >
          <View
            className={`h-5 w-5 items-center justify-center rounded border ${returns ? "border-accent bg-accent" : "border-line dark:border-line-dark"}`}
          >
            {returns ? <Check size={14} color="white" /> : null}
          </View>
          <Text className="flex-1 text-sm text-ink dark:text-ink-dark">{t("permits.returns")}</Text>
        </Pressable>
        <Button
          label={t("permits.submit")}
          fullWidth
          loading={create.isPending}
          disabled={!destination.trim() || !startId || !endId}
          onPress={() =>
            create.mutate(
              {
                destination: destination.trim(),
                start_period_id: startId,
                end_period_id: endId,
                return_required: returns,
              },
              { onSuccess: (d) => onDone(d.instance.id) },
            )
          }
        />
      </ScrollView>
    </View>
  );
}

function PeriodPicker({
  periods,
  value,
  onChange,
}: {
  periods: { id: string; name: string; starts_at: string }[];
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <View className="flex-row flex-wrap gap-2">
      {periods.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === p.id }}
          onPress={() => onChange(p.id)}
          className={`rounded-input border px-3 py-2 ${value === p.id ? "border-accent bg-accent" : "border-line bg-surface dark:border-line-dark dark:bg-surface-dark"}`}
        >
          <Text
            className={
              value === p.id ? "text-sm text-white" : "text-sm text-ink dark:text-ink-dark"
            }
          >
            {p.name} {p.starts_at.slice(0, 5)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function PermitDetail({ id, onBack }: { id: string; onBack: () => void }): React.JSX.Element {
  const { data, isLoading } = useExitPermit(id);
  const cancel = useCancelExitPermit();
  const gate = useIssueGateToken();
  const periods = usePeriods();
  const clock = useSchoolClock();
  const { me } = useAuth();
  if (isLoading || !data)
    return (
      <View className="flex-1 bg-bg dark:bg-bg-dark">
        <ScreenHeader
          title={t("permits.exit_title")}
          right={<Button label={t("common.back")} variant="ghost" onPress={onBack} />}
        />
        <View className="p-4">
          <Skeleton height={200} />
        </View>
      </View>
    );
  const inst = data.instance;
  // Once the permit's last lesson is over the API refuses its gate QR.
  const endPeriod = periods.data?.find((p) => p.id === data.end_period_id);
  const lessonsOver = endPeriod ? lessonEnded(endPeriod, clock) : false;
  const back = returnText(data, me?.tenant.timezone);
  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader
        title={t("permits.exit_title")}
        right={<Button label={t("common.back")} variant="ghost" onPress={onBack} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-base text-ink dark:text-ink-dark">{data.destination}</Text>
        <Text className="text-xs text-ink/60 dark:text-ink-dark/60" selectable>
          {inst.id}
        </Text>
        <WorkflowSteps instance={inst} />
        {inst.status === "in_progress" && inst.current_stage?.verification === "qr_scan" ? (
          <Button
            label={t("permits.scan_stage").replace("{stage}", inst.current_stage.label)}
            fullWidth
            onPress={() => router.push("/scan")}
          />
        ) : null}
        {inst.status === "approved" && !data.exited_at ? (
          gate.data ? (
            <TokenQr
              token={gate.data}
              purpose="gate"
              onRenew={() => gate.mutate(id)}
              renewing={gate.isPending}
            />
          ) : lessonsOver ? (
            <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
              {t("permits.lessons_over")}
            </Text>
          ) : (
            <Button
              label={t("permits.show_gate")}
              fullWidth
              loading={gate.isPending}
              onPress={() => gate.mutate(id)}
            />
          )
        ) : null}
        {data.exited_at ? (
          <Text className="text-sm text-status-present">{t("permits.exited")}</Text>
        ) : null}
        {back ? <Text className="text-sm text-ink dark:text-ink-dark">{back}</Text> : null}
        {inst.status === "in_progress" ? (
          <Button
            label={t("permits.cancel")}
            variant="ghost"
            loading={cancel.isPending}
            onPress={() => cancel.mutate(id)}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
