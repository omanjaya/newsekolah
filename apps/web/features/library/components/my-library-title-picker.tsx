"use client";

import { Input, Popover, PopoverAnchor, PopoverContent } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { type LibraryTitle, useOpacTitlesQuery } from "../api";

/** Search-and-pick a title from the public catalogue, for a member's own reservation request. */
export function MyLibraryTitlePicker({
  onSelect,
}: {
  onSelect: (title: LibraryTitle) => void;
}): ReactElement {
  const t = useTranslations("app.library.me.reserve");
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

  const { data } = useOpacTitlesQuery(debounced);
  const results = debounced.trim().length >= 2 ? (data?.data ?? []) : [];

  return (
    <Popover open={open && results.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder={t("searchPlaceholder")}
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
        <ul role="listbox" aria-label={t("searchPlaceholder")} className="flex flex-col">
          {results.map((title) => (
            <li key={title.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full flex-col rounded-xs px-2 py-2 text-left text-[13px] hover:bg-bg focus-visible:bg-bg"
                onClick={() => {
                  onSelect(title);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="font-medium text-fg">{title.title}</span>
                <span className="text-[12px] text-fg-muted">{title.author}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
