"use client";

import { Combobox, useDebouncedCallback } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { type LibraryTitle, useLibraryTitlesQuery } from "../api";

/**
 * Search-and-pick a title by name, for the class loan and class return
 * forms: the shared async Combobox, each match with how many copies are
 * in. Picking another title replaces the choice; clearing it is choosing
 * again.
 */
export function ClassTitlePicker({
  selected,
  onSelect,
  onClear,
  id,
}: {
  selected: LibraryTitle | null;
  onSelect: (title: LibraryTitle) => void;
  onClear: () => void;
  id?: string;
}): ReactElement {
  const t = useTranslations("app.library.classLoans");
  const tCatalogue = useTranslations("app.library.catalogue");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const debounce = useDebouncedCallback((value: string) => {
    setQuery(value);
  }, 250);
  const { data, isFetching } = useLibraryTitlesQuery({ search: query });
  const results = query.trim().length >= 2 ? (data?.data ?? []) : [];
  const options = [
    ...(selected && !results.some((title) => title.id === selected.id) ? [selected] : []),
    ...results,
  ];

  return (
    <Combobox
      id={id}
      placeholder={t("titleSearchPlaceholder")}
      searchPlaceholder={t("titleSearchPlaceholder")}
      loading={isFetching}
      options={options.map((title) => ({
        value: title.id,
        label: title.title,
        description: tCatalogue("copiesAvailable", {
          available: title.available_copies,
          total: title.total_copies,
        }),
      }))}
      value={selected?.id ?? ""}
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        debounce(value);
      }}
      onValueChange={(titleId) => {
        if (titleId === "") {
          onClear();
          return;
        }
        const title = options.find((candidate) => candidate.id === titleId);
        if (title) onSelect(title);
      }}
    />
  );
}
