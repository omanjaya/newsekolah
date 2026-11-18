"use client";

import { Combobox, useDebouncedCallback } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { type LibraryLookupResult, useLibraryLookupQuery } from "../desk-api";

type LookupMember = NonNullable<LibraryLookupResult["member"]>;

/**
 * The desk's second way to start a session, for a reader without their
 * card: the shared async Combobox over `/v1/library/lookup`, members only
 * (name, member number, NIS or username). Arrow keys and Enter pick a
 * match, the same as every other picker in the app.
 */
export function DeskMemberSearch({
  onSelectMember,
  className,
}: {
  onSelectMember: (member: LookupMember) => void;
  className?: string;
}): ReactElement {
  const t = useTranslations("app.library.desk.bar");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const debounce = useDebouncedCallback((value: string) => {
    setQuery(value);
  }, 250);
  const { data, isFetching } = useLibraryLookupQuery(query);
  const members = (data?.data ?? [])
    .map((result) => result.member)
    .filter((member): member is LookupMember => member !== undefined);

  return (
    <Combobox
      className={className}
      aria-label={t("searchMember")}
      placeholder={t("searchMember")}
      searchPlaceholder={t("searchMemberPlaceholder")}
      emptyLabel={t("searchEmpty")}
      loading={isFetching}
      options={members.map((member) => ({
        value: member.user_id,
        label: member.user_name,
        description: [member.member_no, member.nis, member.username].filter(Boolean).join(" · "),
      }))}
      value=""
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        debounce(value);
      }}
      onValueChange={(userId) => {
        const member = members.find((candidate) => candidate.user_id === userId);
        if (!member) return;
        setSearch("");
        setQuery("");
        onSelectMember(member);
      }}
    />
  );
}
