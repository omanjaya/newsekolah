"use client";

import { Badge, Skeleton, domainIcons } from "@newsekolah/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useOpacHighlightsQuery } from "../api";

/**
 * Newest arrivals and most-borrowed titles on the OPAC landing page
 * (GET /v1/opac/highlights, public). Rendered above the search results so
 * a visitor with no query yet still sees something worth reading, rather
 * than a blank page.
 */
export function OpacHighlights(): ReactElement | null {
  const t = useTranslations("app.library.opac.highlights");
  const { data, isLoading } = useOpacHighlightsQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-busy="true">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!data || (data.newest.length === 0 && data.most_borrowed.length === 0)) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {data.newest.length > 0 && <TitleGroup label={t("newest")} titles={data.newest} />}
      {data.most_borrowed.length > 0 && (
        <TitleGroup label={t("mostBorrowed")} titles={data.most_borrowed} />
      )}
    </div>
  );
}

function TitleGroup({
  label,
  titles,
}: {
  label: string;
  titles: { id: string; title: string; author: string; available_copies: number }[];
}): ReactElement {
  const t = useTranslations("app.library.opac");
  return (
    <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[14px] font-medium text-fg">{label}</h2>
      <ul className="flex flex-col gap-2">
        {titles.map((title) => (
          <li key={title.id} className="min-w-0">
            <Link
              href={`/opac/${title.id}`}
              className="-mx-2 flex min-h-11 min-w-0 items-center gap-2 rounded-sm px-2 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-bg"
            >
              <domainIcons.library className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] text-fg">{title.title}</span>
                <span className="truncate text-[12px] text-fg-muted">{title.author}</span>
              </div>
              {/* Same wording as the search results below, so a bare count
                  never leaves the reader guessing what it counts. */}
              <Badge variant={title.available_copies > 0 ? "accent" : "neutral"}>
                {title.available_copies > 0 ? t("available") : t("unavailable")}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
