import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Repeat } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { showToast } from "@/components/ui/Toast";
import {
  useCancelSubstitution,
  useClasses,
  useCreateSubstitution,
  useDirectory,
  useMySchedules,
  useRespondSubstitution,
  useSubjects,
  useSubstitutions,
  type Substitution,
} from "@/lib/api/hooks";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { t, type MobileMessageKey } from "@/i18n/t";

const INPUT =
  "rounded-input border border-line bg-surface px-3 py-2 text-base text-ink dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark";
type Direction = "incoming" | "outgoing";

/** Requesting and responding to a substitute for one's own scheduled
 * occurrence (docs/10-mobile-strategy.md, "permintaan pengganti"). Incoming
 * is what colleagues asked this teacher to cover; outgoing is what this
 * teacher asked someone else to cover. */
export default function SubstitutionsRoute(): React.JSX.Element {
  const [direction, setDirection] = useState<Direction>("incoming");
  const [creating, setCreating] = useState(false);
  const list = useSubstitutions(direction);
  const items = list.data?.data ?? [];

  if (creating)
    return <SubstitutionForm onDone={() => setCreating(false)} onBack={() => setCreating(false)} />;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader
        title={t("substitution.title")}
        showBack
        right={
          <Button
            label={t("substitution.request")}
            variant="ghost"
            onPress={() => setCreating(true)}
          />
        }
      />
      <View className="flex-row gap-2 px-4 pt-3">
        <Button
          label={t("substitution.incoming")}
          variant={direction === "incoming" ? "primary" : "secondary"}
          onPress={() => setDirection("incoming")}
        />
        <Button
          label={t("substitution.outgoing")}
          variant={direction === "outgoing" ? "primary" : "secondary"}
          onPress={() => setDirection("outgoing")}
        />
      </View>
      {list.isLoading ? (
        <View className="gap-2 p-4">
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState icon={Repeat} title={t("substitution.empty")} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {items.map((item) => (
            <SubstitutionRow key={item.id} item={item} direction={direction} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function SubstitutionRow({
  item,
  direction,
}: {
  item: Substitution;
  direction: Direction;
}): React.JSX.Element {
  const respond = useRespondSubstitution();
  const cancel = useCancelSubstitution();

  return (
    <View className="gap-2 rounded-input border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark">
      <Text className="text-base text-ink dark:text-ink-dark">{item.date}</Text>
      <Text className="text-sm text-accent">
        {t(`substitution.status.${item.status}` as MobileMessageKey)}
      </Text>
      {item.requester_note ? (
        <Text className="text-sm text-ink/60 dark:text-ink-dark/60">{item.requester_note}</Text>
      ) : null}
      {direction === "incoming" && item.status === "pending" ? (
        <View className="flex-row gap-2">
          <Button
            label={t("substitution.accept")}
            loading={respond.isPending}
            onPress={() =>
              respond.mutate(
                { id: item.id, accept: true },
                { onError: () => showToast(t("common.error"), "error") },
              )
            }
          />
          <Button
            label={t("substitution.decline")}
            variant="secondary"
            loading={respond.isPending}
            onPress={() =>
              respond.mutate(
                { id: item.id, accept: false },
                { onError: () => showToast(t("common.error"), "error") },
              )
            }
          />
        </View>
      ) : null}
      {direction === "outgoing" && item.status === "pending" ? (
        <Button
          label={t("permits.cancel")}
          variant="ghost"
          loading={cancel.isPending}
          onPress={() =>
            cancel.mutate(item.id, { onError: () => showToast(t("common.error"), "error") })
          }
        />
      ) : null}
    </View>
  );
}

/** ISO weekday (1 = Monday .. 7 = Sunday) for a "YYYY-MM-DD" string, or null
 * while the date is still incomplete. */
function isoWeekday(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function SubstitutionForm({
  onDone,
  onBack,
}: {
  onDone: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const create = useCreateSubstitution();
  const classes = useClasses();
  const subjects = useSubjects();
  const classMap = useMemo(
    () => new Map((classes.data?.data ?? []).map((c) => [c.id, c.name])),
    [classes.data],
  );
  const subjectMap = useMemo(
    () => new Map((subjects.data?.data ?? []).map((s) => [s.id, s.name])),
    [subjects.data],
  );

  const [date, setDate] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [substituteQuery, setSubstituteQuery] = useState("");
  const [substitute, setSubstitute] = useState<{ id: string; name: string } | null>(null);
  const [note, setNote] = useState("");

  const weekday = isoWeekday(date);
  const mySchedules = useMySchedules(weekday ?? 0);
  const debouncedQuery = useDebouncedValue(substituteQuery, 300);
  const directory = useDirectory("teacher", debouncedQuery);

  const valid = date !== "" && scheduleId !== "" && substitute !== null;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader
        title={t("substitution.request")}
        right={<Button label={t("common.back")} variant="ghost" onPress={onBack} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text className="text-sm text-ink dark:text-ink-dark">{t("substitution.date")}</Text>
        <TextInput
          value={date}
          onChangeText={(next) => {
            setDate(next);
            setScheduleId("");
          }}
          placeholder={t("leave.starts")}
          autoCapitalize="none"
          className={INPUT}
        />

        {weekday ? (
          <>
            <Text className="text-sm text-ink dark:text-ink-dark">
              {t("substitution.pick_class")}
            </Text>
            {mySchedules.isLoading ? (
              <Skeleton height={44} />
            ) : (mySchedules.data?.data ?? []).length === 0 ? (
              <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
                {t("substitution.no_schedule")}
              </Text>
            ) : (
              <View className="gap-2">
                {(mySchedules.data?.data ?? []).map((block) => {
                  const id = block.schedule_ids[0];
                  if (!id) return null;
                  const selected = scheduleId === id;
                  return (
                    <Pressable
                      key={id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setScheduleId(id)}
                      className={`rounded-input border px-3 py-2 ${selected ? "border-accent bg-accent" : "border-line bg-surface dark:border-line-dark dark:bg-surface-dark"}`}
                    >
                      <Text
                        className={
                          selected ? "text-sm text-white" : "text-sm text-ink dark:text-ink-dark"
                        }
                      >
                        {classMap.get(block.class_id) ?? "-"} ·{" "}
                        {subjectMap.get(block.subject_id) ?? "-"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        ) : null}

        <Text className="text-sm text-ink dark:text-ink-dark">
          {t("substitution.pick_substitute")}
        </Text>
        {substitute ? (
          <View className="flex-row items-center justify-between rounded-input border border-accent bg-accent/10 px-3 py-2">
            <Text className="text-sm text-ink dark:text-ink-dark">{substitute.name}</Text>
            <Button label={t("common.pick")} variant="ghost" onPress={() => setSubstitute(null)} />
          </View>
        ) : (
          <>
            <TextInput
              value={substituteQuery}
              onChangeText={setSubstituteQuery}
              placeholder={t("substitution.search_teacher")}
              autoCapitalize="none"
              className={INPUT}
            />
            <View className="gap-1">
              {(directory.data?.data ?? []).map((person) => (
                <Pressable
                  key={person.id}
                  accessibilityRole="button"
                  onPress={() => setSubstitute({ id: person.id, name: person.name })}
                  className="rounded-input border border-line bg-surface px-3 py-2 dark:border-line-dark dark:bg-surface-dark"
                >
                  <Text className="text-sm text-ink dark:text-ink-dark">{person.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t("substitution.note")}
          multiline
          className={`${INPUT} min-h-20`}
        />
        <Button
          label={t("substitution.send")}
          fullWidth
          loading={create.isPending}
          disabled={!valid}
          onPress={() =>
            create.mutate(
              {
                schedule_id: scheduleId,
                date,
                substitute_user_id: substitute?.id ?? "",
                ...(note.trim() ? { note: note.trim() } : {}),
              },
              {
                onSuccess: () => {
                  showToast(t("substitution.sent"), "success");
                  onDone();
                },
                onError: () => showToast(t("common.error"), "error"),
              },
            )
          }
        />
      </ScrollView>
    </View>
  );
}
