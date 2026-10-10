"use client";

import { Combobox, useDebouncedCallback } from "@newsekolah/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactElement } from "react";

import { useApiClient } from "../../../lib/api/client";
import type { ProfileKind } from "../api";
import { useDirectoryName } from "../directory-names";

/** Results per search; the server ranks, so a short page is enough. */
export const DIRECTORY_PICKER_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 300;

export interface DirectoryPickerLabels {
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  loadingLabel?: string;
}

/**
 * A person picker that searches the directory on the server instead of
 * loading every user into the page. Use it for fields where the whole
 * roster would be thousands of rows. The picked person is kept in local
 * state so the trigger keeps showing the name after the search text moves
 * on; a preset value (edit mode) is resolved by id, or taken from
 * `selectedLabel` when the caller already has it. Without `profileKind`
 * everyone in the school is searchable.
 */
export function DirectoryPicker({
  profileKind,
  value,
  onValueChange,
  selectedLabel,
  labels,
  disabled,
  className,
}: {
  profileKind?: ProfileKind;
  value: string;
  onValueChange: (id: string, label: string) => void;
  selectedLabel?: string;
  labels: DirectoryPickerLabels;
  disabled?: boolean;
  className?: string;
}): ReactElement {
  const client = useApiClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ value: string; label: string }>();
  const debounce = useDebouncedCallback(setQuery, SEARCH_DEBOUNCE_MS);
  const presetPerson = useDirectoryName(
    selectedLabel === undefined && picked?.value !== value ? value : undefined,
  );

  const results = useQuery({
    queryKey: ["directory", "search", profileKind ?? "all", query],
    queryFn: () =>
      client.GET("/v1/directory/users", {
        params: {
          query: {
            ...(profileKind ? { profile_kind: profileKind } : {}),
            q: query,
            limit: DIRECTORY_PICKER_LIMIT,
          },
        },
      }),
    staleTime: 30_000,
  });

  const options = useMemo(() => {
    const base = (results.data?.data ?? []).map((user) => ({ value: user.id, label: user.name }));
    if (value !== "" && !base.some((option) => option.value === value)) {
      const label =
        picked?.value === value ? picked.label : (selectedLabel ?? presetPerson?.name ?? "");
      if (label !== "") return [{ value, label }, ...base];
    }
    return base;
  }, [results.data, value, picked, selectedLabel, presetPerson]);

  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={(id) => {
        const label = options.find((option) => option.value === id)?.label ?? "";
        setPicked({ value: id, label });
        onValueChange(id, label);
      }}
      search={search}
      onSearchChange={(next) => {
        setSearch(next);
        debounce(next.trim());
      }}
      placeholder={labels.placeholder}
      searchPlaceholder={labels.searchPlaceholder}
      emptyLabel={labels.emptyLabel}
      {...(labels.loadingLabel ? { loadingLabel: labels.loadingLabel } : {})}
      loading={results.isFetching}
      {...(disabled !== undefined ? { disabled } : {})}
      {...(className ? { className } : {})}
    />
  );
}
