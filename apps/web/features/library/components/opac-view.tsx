"use client";

import { Badge, EmptyState, Input, Skeleton, domainIcons } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useOpacTitlesQuery } from "../api";

/** Public catalogue search: no session, reachable from a kiosk or a phone. */
export function OpacView(): ReactElement {
  const t = useTranslations("app.library.opac");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useOpacTitlesQuery(search);
  const titles = data?.data ?? [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-[22px] font-semibold text-fg">{t("title")}</h1>
      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
        }}
        placeholder={t("searchPlaceholder")}
      />

      {isLoading ? (
        <Skeleton className="h-48 w-full" aria-busy="true" />
      ) : titles.length === 0 ? (
        <EmptyState
          icon={<domainIcons.library aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {titles.map((title) => (
            <li
              key={title.id}
              className="flex items-center justify-between gap-4 rounded-sm border border-border bg-surface p-3"
            >
              <div>
                <p className="text-[14px] font-medium text-fg">{title.title}</p>
                <p className="text-[13px] text-fg-muted">{title.author}</p>
              </div>
              <Badge variant={title.available_copies > 0 ? "accent" : "neutral"}>
                {title.available_copies > 0 ? t("available") : t("unavailable")}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
