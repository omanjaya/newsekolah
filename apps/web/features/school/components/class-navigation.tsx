"use client";

import { Input, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useGradeLevelsQuery, type ClassRow } from "../api";

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
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Input
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
        className="flex min-w-0 gap-1 overflow-x-auto md:max-h-[65dvh] md:flex-col md:overflow-y-auto"
      >
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={selectedId === item.id ? "true" : undefined}
            onClick={() => {
              onSelect(item.id);
            }}
            title={item.name}
            className={`flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-xs px-3 py-2 text-left text-[14px] ${selectedId === item.id ? "bg-accent/10 text-fg font-medium" : "text-fg hover:bg-bg"}`}
          >
            {item.name}
          </button>
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
