"use client";

import { Input, Popover, PopoverAnchor, PopoverContent } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { type LibraryTitle, useLibraryTitlesQuery } from "../api";

/** Search-and-pick a title by name, for class loan and class return forms. */
export function ClassTitlePicker({
  selected,
  onSelect,
  onClear,
}: {
  selected: LibraryTitle | null;
  onSelect: (title: LibraryTitle) => void;
  onClear: () => void;
}): ReactElement {
  const t = useTranslations("app.library.classLoans");
  const tCatalogue = useTranslations("app.library.catalogue");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query);
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  const { data } = useLibraryTitlesQuery(debounced);
  const results = debounced.trim().length >= 2 ? (data?.data ?? []) : [];

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-xs border border-border bg-bg px-3 py-2 text-[13px]">
        <span className="font-medium text-fg">{selected.title}</span>
        <button
          type="button"
          className="text-accent underline underline-offset-2"
          onClick={() => {
            onClear();
            setQuery("");
          }}
        >
          {t("changeTitle")}
        </button>
      </div>
    );
  }

  return (
    <Popover open={open && results.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder={t("titleSearchPlaceholder")}
          role="combobox"
          aria-expanded={open && results.length > 0}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-80 p-1"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
      >
        <ul role="listbox" aria-label={t("titleSearchPlaceholder")} className="flex flex-col">
          {results.map((title) => (
            <li key={title.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full flex-col rounded-xs px-2 py-2 text-left text-[13px] hover:bg-bg focus-visible:bg-bg"
                onClick={() => {
                  onSelect(title);
                  setOpen(false);
                }}
              >
                <span className="font-medium text-fg">{title.title}</span>
                <span className="text-[12px] text-fg-muted">
                  {tCatalogue("copiesAvailable", {
                    available: title.available_copies,
                    total: title.total_copies,
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
