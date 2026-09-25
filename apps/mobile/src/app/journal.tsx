import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { NotebookPen } from "lucide-react-native";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useClasses,
  useDeleteJournal,
  useJournals,
  useSubjects,
  useUpsertJournal,
  useActiveYearId,
  type Journal,
} from "@/lib/api/hooks";
import { t } from "@/i18n/t";

const INPUT =
  "rounded-input border border-line bg-surface px-3 py-2 text-base text-ink dark:border-line-dark dark:bg-surface-dark dark:text-ink-dark";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A teacher's own class journals: one entry per class/subject/day
 * (docs/10-mobile-strategy.md, "jurnal kelas"). Separate from the topic and
 * activities fields already saved from the attendance editor -- this
 * screen is where a teacher reviews or backfills the log across days,
 * rather than typing it once while taking attendance. */
export default function JournalRoute(): React.JSX.Element {
  const list = useJournals();
  const subjects = useSubjects();
  const classes = useClasses();
  const subjectMap = useMemo(
    () => new Map((subjects.data?.data ?? []).map((s) => [s.id, s.name])),
    [subjects.data],
  );
  const classMap = useMemo(
    () => new Map((classes.data?.data ?? []).map((c) => [c.id, c.name])),
    [classes.data],
  );
  const [editing, setEditing] = useState<Journal | "new" | null>(null);
  const items = [...(list.data?.data ?? [])].sort((a, b) =>
    a.lesson_date < b.lesson_date ? 1 : -1,
  );

  if (editing) {
    return (
      <JournalForm
        journal={editing === "new" ? null : editing}
        onDone={() => setEditing(null)}
        onBack={() => setEditing(null)}
      />
    );
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader
        title={t("journal.title")}
        showBack
        right={
          <Button label={t("journal.new")} variant="ghost" onPress={() => setEditing("new")} />
        }
      />
      {list.isLoading ? (
        <View className="gap-2 p-4">
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title={t("journal.empty")}
          actionLabel={t("journal.new")}
          onAction={() => setEditing("new")}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {items.map((journal) => (
            <Pressable
              key={journal.id}
              accessibilityRole="button"
              onPress={() => setEditing(journal)}
              className="gap-1 rounded-input border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark"
            >
              <Text className="text-sm text-ink/60 dark:text-ink-dark/60">
                {journal.lesson_date} · {classMap.get(journal.class_id) ?? "-"} ·{" "}
                {subjectMap.get(journal.subject_id) ?? "-"}
              </Text>
              <Text className="text-base text-ink dark:text-ink-dark" numberOfLines={2}>
                {journal.topic}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function JournalForm({
  journal,
  onDone,
  onBack,
}: {
  journal: Journal | null;
  onDone: () => void;
  onBack: () => void;
}): React.JSX.Element {
  const yearId = useActiveYearId();
  const classes = useClasses();
  const subjects = useSubjects();
  const upsert = useUpsertJournal();
  const remove = useDeleteJournal();

  const [classId, setClassId] = useState(journal?.class_id ?? "");
  const [subjectId, setSubjectId] = useState(journal?.subject_id ?? "");
  const [lessonDate, setLessonDate] = useState(journal?.lesson_date ?? today());
  const [topic, setTopic] = useState(journal?.topic ?? "");
  const [activities, setActivities] = useState(journal?.activities ?? "");
  const [reflection, setReflection] = useState(journal?.reflection ?? "");

  const valid =
    classId !== "" &&
    subjectId !== "" &&
    /^\d{4}-\d{2}-\d{2}$/.test(lessonDate) &&
    topic.trim() !== "";

  function save(): void {
    // Success/error feedback comes from the mutation cache default now
    // (useUpsertJournal's meta.successMessage / the translated error toast).
    upsert.mutate(
      {
        academic_year_id: yearId,
        class_id: classId,
        subject_id: subjectId,
        lesson_date: lessonDate,
        topic: topic.trim(),
        activities: activities.trim(),
        ...(reflection.trim() ? { reflection: reflection.trim() } : {}),
      },
      { onSuccess: onDone },
    );
  }

  function del(): void {
    if (!journal) return;
    // Deleting a journal entry is permanent; confirm before it fires.
    Alert.alert(t("journal.delete_confirm_title"), t("journal.delete_confirm_body"), [
      { text: t("common.no"), style: "cancel" },
      {
        text: t("journal.delete"),
        style: "destructive",
        onPress: () => {
          // Success/error feedback comes from the mutation cache default now
          // (useDeleteJournal's meta.successMessage / the translated error toast).
          remove.mutate(journal.id, { onSuccess: onDone });
        },
      },
    ]);
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark">
      <ScreenHeader
        title={journal ? t("journal.edit") : t("journal.new")}
        right={<Button label={t("common.back")} variant="ghost" onPress={onBack} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text className="text-sm text-ink dark:text-ink-dark">{t("journal.class")}</Text>
        <View className="flex-row flex-wrap gap-2">
          {(classes.data?.data ?? []).map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: classId === c.id }}
              onPress={() => setClassId(c.id)}
              className={`rounded-input border px-3 py-2 ${classId === c.id ? "border-accent bg-accent" : "border-line bg-surface dark:border-line-dark dark:bg-surface-dark"}`}
            >
              <Text
                className={
                  classId === c.id ? "text-sm text-white" : "text-sm text-ink dark:text-ink-dark"
                }
              >
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text className="text-sm text-ink dark:text-ink-dark">{t("journal.subject")}</Text>
        <View className="flex-row flex-wrap gap-2">
          {(subjects.data?.data ?? []).map((s) => (
            <Pressable
              key={s.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: subjectId === s.id }}
              onPress={() => setSubjectId(s.id)}
              className={`rounded-input border px-3 py-2 ${subjectId === s.id ? "border-accent bg-accent" : "border-line bg-surface dark:border-line-dark dark:bg-surface-dark"}`}
            >
              <Text
                className={
                  subjectId === s.id ? "text-sm text-white" : "text-sm text-ink dark:text-ink-dark"
                }
              >
                {s.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={lessonDate}
          onChangeText={setLessonDate}
          placeholder={t("journal.date")}
          autoCapitalize="none"
          className={INPUT}
        />
        <TextInput
          value={topic}
          onChangeText={setTopic}
          placeholder={t("journal.topic")}
          className={INPUT}
        />
        <TextInput
          value={activities}
          onChangeText={setActivities}
          placeholder={t("journal.activities")}
          multiline
          className={`${INPUT} min-h-20`}
        />
        <TextInput
          value={reflection}
          onChangeText={setReflection}
          placeholder={t("journal.reflection")}
          multiline
          className={`${INPUT} min-h-20`}
        />
        <Button
          label={t("journal.save")}
          fullWidth
          loading={upsert.isPending}
          disabled={!valid}
          onPress={save}
        />
        {journal ? (
          <Button
            label={t("journal.delete")}
            variant="destructive"
            fullWidth
            loading={remove.isPending}
            onPress={del}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
