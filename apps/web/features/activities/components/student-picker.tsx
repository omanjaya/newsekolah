"use client";

import { Combobox } from "@newsekolah/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";

import { useApiClient } from "../../../lib/api/client";
import { useDirectoryQuery } from "../../reference/api";

export function StudentName({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.activities.students");
  const directory = useDirectoryQuery("student");
  return <>{directory.data?.data.find((student) => student.id === id)?.name ?? t("unknown")}</>;
}

export function StudentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  const t = useTranslations("app.activities.students");
  const client = useApiClient();
  const directory = useDirectoryQuery("student");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ value: string; label: string }>();
  const results = useQuery({
    queryKey: ["activities", "student-search", search],
    queryFn: () =>
      client.GET("/v1/directory/users", {
        params: { query: { profile_kind: "student", q: search, limit: 50 } },
      }),
  });
  const options = (results.data?.data ?? []).map((student) => ({
    value: student.id,
    label: `${student.name} (${student.username})`,
  }));
  const current =
    selected?.value === value
      ? selected
      : directory.data?.data
          .filter((student) => student.id === value)
          .map((student) => ({
            value: student.id,
            label: `${student.name} (${student.username})`,
          }))[0];
  if (value && !options.some((option) => option.value === value))
    options.unshift(current ?? { value, label: t("unknown") });
  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={(id) => {
        setSelected(options.find((option) => option.value === id));
        onChange(id);
      }}
      search={search}
      onSearchChange={setSearch}
      placeholder={t("choose")}
      searchPlaceholder={t("search")}
      emptyLabel={t("empty")}
      loadingLabel={t("loading")}
      loading={results.isFetching}
      aria-label={t("choose")}
    />
  );
}
