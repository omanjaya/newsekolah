"use client";

import { SearchInput, Select, cn } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactElement } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useGradeLevelsQuery, type ClassRow } from "../api";

interface ClassGroup {
  id: string;
  label?: string;
  items: ClassRow[];
}

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
  const [search, setSearch] = useState("");
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
  const filtered = items.filter(
    (item) =>
      (!grade || item.grade_level_id === grade) &&
      item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
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

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-sm border border-border bg-surface p-2 md:min-h-0">
      <SearchInput
        aria-label={t("searchClasses")}
        placeholder={t("searchClasses")}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
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
      <nav
        aria-label={t("title")}
        className="flex min-w-0 gap-1 overflow-x-auto md:min-h-0 md:flex-1 md:flex-col md:overflow-y-auto"
      >
        {groups.map((group) => (
          <div key={group.id} className="contents">
            {group.label && (
              <p className="hidden px-3 pt-2 pb-1 text-[12px] font-medium text-fg-muted md:block">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const selected = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => {
                    onSelect(item.id);
                  }}
                  title={item.name}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-xs px-3 py-2 text-left text-[14px]",
                    "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
                    "md:border-l-2",
                    selected
                      ? "bg-accent/10 text-fg font-medium md:border-accent"
                      : "text-fg hover:bg-bg md:border-transparent",
                  )}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <p role="status" className="px-3 py-2 text-[13px] text-fg-muted">
            {common("states.noResults")}
          </p>
        )}
      </nav>
    </div>
  );
}
