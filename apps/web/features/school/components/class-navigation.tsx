"use client";

import {
  Avatar,
  Card,
  List,
  ListRow,
  SearchInput,
  Select,
  useDebouncedCallback,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactElement } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";
import { useDirectoryNames } from "../../reference/directory-names";
import { STUDENT_SEARCH_MIN_CHARS, useStudentSearchQuery } from "../../students/api";
import { studentProfileHref } from "../../students/href";
import { useGradeLevelsQuery, type ClassRow } from "../api";

interface ClassGroup {
  id: string;
  label?: string;
  items: ClassRow[];
}

/** Pause after the last keystroke before the student directory is asked. */
const STUDENT_SEARCH_DEBOUNCE_MS = 300;

/**
 * The left half of Siswa dan kelas: one search for a class or a student,
 * the grade filter, and the classes grouped by grade with their homeroom
 * teacher. A student hit opens the profile, wherever the student sits. On
 * a phone the list gives way to one class picker, so the roster stays on
 * the first screen.
 */
export function ClassNavigation({
  items,
  selectedId,
  onSelect,
}: {
  items: ClassRow[];
  selectedId?: string;
  onSelect: (id: string) => void;
}): ReactElement {
  const t = useTranslations("app.school.classes");
  const common = useTranslations("common");
  const { me } = useSession();
  const [search, setSearch] = useState("");
  const [studentTerm, setStudentTerm] = useState("");
  const debounceStudentTerm = useDebouncedCallback(setStudentTerm, STUDENT_SEARCH_DEBOUNCE_MS);
  const canOpenProfiles = useMemo(
    () => (me ? canOpenPath(studentProfileHref("student"), navAccessFromMe(me)) : false),
    [me],
  );
  const students = useStudentSearchQuery(studentTerm, canOpenProfiles);
  const grades = useGradeLevelsQuery();
  const options = (grades.data?.data ?? []).map((grade) => ({
    value: grade.id,
    label: grade.name,
  }));
  const [grade, setGrade] = useUrlState(
    "grade",
    ["", ...options.map((option) => option.value)],
    "",
  );
  const homerooms = useDirectoryNames(items.map((item) => item.homeroom_teacher_id));
  const query = search.trim().toLocaleLowerCase();
  const filtered = items.filter(
    (item) =>
      (!grade || item.grade_level_id === grade) && item.name.toLocaleLowerCase().includes(query),
  );
  const studentHits =
    canOpenProfiles && search.trim().length >= STUDENT_SEARCH_MIN_CHARS
      ? (students.data ?? [])
      : [];
  // Grouped by grade level, in the same order the grades query returns them,
  // so the list reads top-to-bottom the way a school year is structured
  // rather than alphabetically by class name.
  const groups = useMemo<ClassGroup[]>(() => {
    const byGrade = new Map<string, ClassRow[]>();
    const knownGradeIds = new Set(options.map((option) => option.value));
    const unknown: ClassRow[] = [];
    for (const item of filtered) {
      if (!knownGradeIds.has(item.grade_level_id)) {
        unknown.push(item);
        continue;
      }
      const list = byGrade.get(item.grade_level_id) ?? [];
      list.push(item);
      byGrade.set(item.grade_level_id, list);
    }
    const ordered: ClassGroup[] = options
      .map((option) => ({
        id: option.value,
        label: option.label,
        items: byGrade.get(option.value) ?? [],
      }))
      .filter((group) => group.items.length > 0);
    if (unknown.length > 0) {
      ordered.push({ id: "__unknown__", label: undefined, items: unknown });
    }
    return ordered;
  }, [filtered, options]);

  const homeroomOf = (item: ClassRow): string => {
    const name = item.homeroom_teacher_id
      ? homerooms.get(item.homeroom_teacher_id)?.name
      : undefined;
    return name ?? t("noHomeroomShort");
  };

  return (
    // A phone or a tablet gets one class picker above the class (the
    // header search already finds students); from lg, with room for both
    // panes beside the sidebar, the searchable list.
    <div className="contents">
      <Select
        className="lg:hidden"
        aria-label={t("pickClass")}
        options={items.map((item) => ({ value: item.id, label: item.name }))}
        value={selectedId}
        placeholder={t("pickClass")}
        onValueChange={onSelect}
      />
      <Card className="flex min-w-0 flex-col max-lg:hidden lg:min-h-0">
        <div className="flex flex-col gap-2 p-3">
          <SearchInput
            aria-label={t("searchClasses")}
            placeholder={t("searchClasses")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              debounceStudentTerm(event.target.value);
            }}
          />
          {options.length > 1 && (
            <Select
              aria-label={t("form.grade")}
              options={[{ value: "all", label: t("allGrades") }, ...options]}
              value={grade || "all"}
              onValueChange={(value) => {
                setGrade(value === "all" ? "" : value);
              }}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {studentHits.length > 0 && (
            <section aria-label={t("studentResults")} className="flex flex-col pb-2">
              <p className="px-4 pt-1 pb-1 text-caption text-fg-muted">{t("studentResults")}</p>
              <List dense variant="plain">
                {studentHits.map((hit) => (
                  <ListRow
                    key={hit.id}
                    leading={<Avatar size={32} name={hit.name} decorative />}
                    title={hit.name}
                    meta={hit.nis ?? hit.username}
                    href={studentProfileHref(hit.id)}
                  />
                ))}
              </List>
            </section>
          )}
          <nav aria-label={t("classList")}>
            {groups.map((group) => (
              <section key={group.id} className="flex flex-col pb-2">
                {group.label && (
                  <p className="px-4 pt-1 pb-1 text-caption text-fg-muted">{group.label}</p>
                )}
                <List dense variant="plain">
                  {group.items.map((item) => (
                    <ListRow
                      key={item.id}
                      title={item.name}
                      meta={homeroomOf(item)}
                      selected={selectedId === item.id}
                      chevron={false}
                      onClick={() => {
                        onSelect(item.id);
                      }}
                    />
                  ))}
                </List>
              </section>
            ))}
          </nav>
          {filtered.length === 0 && studentHits.length === 0 && (
            <p role="status" className="px-4 pb-4 text-body-sm text-fg-muted">
              {common("states.noResults")}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
