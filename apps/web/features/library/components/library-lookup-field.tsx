"use client";

import { Input, Popover, PopoverAnchor, PopoverContent } from "@newsekolah/ui";
import { BookOpen, Loader2, User } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

import { type LibraryLookupResult, useLibraryLookupQuery } from "../desk-api";

/**
 * One search box over `/v1/library/lookup`, matching members and copies at
 * once: type a name, member number, NIS, username, barcode, or title, and
 * pick the match instead of pasting an id. This is the field that replaces
 * the desk's old "ID anggota" text input.
 */
export function LibraryLookupField({
  onSelectMember,
  onSelectCopy,
  placeholder,
}: {
  onSelectMember?: (member: NonNullable<LibraryLookupResult["member"]>) => void;
  onSelectCopy?: (copy: NonNullable<LibraryLookupResult["copy"]>) => void;
  placeholder?: string;
}): ReactElement {
  const t = useTranslations("app.library.desk.lookup");
  const tStatus = useTranslations("app.library.copiesBrowser.status");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query);
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  const { data, isFetching } = useLibraryLookupQuery(debounced);
  const results = data?.data ?? [];
  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="flex flex-col gap-1 text-[13px]">
      <span className="font-medium text-fg">{t("label")}</span>
      <Popover open={showPanel} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => {
                if (query.trim().length >= 2) setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder={placeholder ?? t("placeholder")}
              className="w-72"
              role="combobox"
              aria-expanded={showPanel}
              aria-autocomplete="list"
            />
            {isFetching && (
              <Loader2
                className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-fg-muted"
                aria-hidden="true"
              />
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-72 p-1"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
          }}
        >
          {results.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-fg-muted">{t("noMatch")}</p>
          ) : (
            <ul role="listbox" aria-label={t("label")} className="flex flex-col">
              {results.map((result) => {
                const member = result.member;
                const copy = result.copy;
                if (member && onSelectMember) {
                  return (
                    <li key={`member-${member.user_id}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="flex w-full items-center gap-2 rounded-xs px-2 py-2 text-left text-[13px] text-fg hover:bg-bg focus-visible:bg-bg"
                        onClick={() => {
                          onSelectMember(member);
                          setQuery("");
                          setOpen(false);
                        }}
                      >
                        <User className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                        <span className="flex flex-col">
                          <span className="font-medium">{member.user_name}</span>
                          <span className="text-[12px] text-fg-muted">
                            {[member.member_no, member.nis, member.username]
                              .filter(Boolean)
                              .join(" - ")}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                }
                if (copy && onSelectCopy) {
                  return (
                    <li key={`copy-${copy.copy_id}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="flex w-full items-center gap-2 rounded-xs px-2 py-2 text-left text-[13px] text-fg hover:bg-bg focus-visible:bg-bg"
                        onClick={() => {
                          onSelectCopy(copy);
                          setQuery("");
                          setOpen(false);
                        }}
                      >
                        <BookOpen className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                        <span className="flex flex-col">
                          <span className="font-medium">{copy.title}</span>
                          <span className="text-[12px] text-fg-muted">
                            {copy.barcode} - {tStatus(copy.status)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                }
                return null;
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
