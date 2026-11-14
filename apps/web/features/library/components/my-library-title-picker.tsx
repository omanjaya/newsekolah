"use client";

import { Combobox, useDebouncedCallback } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { type LibraryTitle } from "../api";
import { useOpacTitlesQuery } from "../opac-api";

/**
 * Search-and-pick a title from the public catalogue, for a member's own
 * hold: the shared async Combobox (arrow keys, Enter, the same list as
 * every picker), as wide as the card it sits in.
 */
export function MyLibraryTitlePicker({
  selected,
  onSelect,
}: {
  selected: LibraryTitle | null;
  onSelect: (title: LibraryTitle) => void;
}): ReactElement {
  const t = useTranslations("app.library.me.reserve");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const debounce = useDebouncedCallback((value: string) => {
    setQuery(value);
  }, 250);
  const { data, isFetching } = useOpacTitlesQuery(query);
  const results = query.trim().length >= 2 ? (data?.data ?? []) : [];
  // Keep the chosen title in the options, so the field still names it once
  // the search moves on.
  const options = [
    ...(selected && !results.some((title) => title.id === selected.id) ? [selected] : []),
    ...results,
  ];

  return (
    <Combobox
      placeholder={t("searchPlaceholder")}
      searchPlaceholder={t("searchPlaceholder")}
      loading={isFetching}
      options={options.map((title) => ({
        value: title.id,
        label: title.title,
        description: title.author,
      }))}
      value={selected?.id ?? ""}
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        debounce(value);
      }}
      onValueChange={(id) => {
        const title = options.find((candidate) => candidate.id === id);
        if (title) onSelect(title);
      }}
    />
  );
}
